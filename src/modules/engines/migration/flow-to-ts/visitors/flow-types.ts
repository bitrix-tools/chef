import * as t from '@babel/types';

import type { NodePath } from '@babel/traverse';
import type { TraverseOptions } from '@babel/traverse';

// Flow utility type name → TypeScript equivalent name
const SIMPLE_RENAMES: Record<string, string> = {
	$Shape: 'Partial',
	$ReadOnly: 'Readonly',
	$ReadOnlyArray: 'ReadonlyArray',
	$NonMaybeType: 'NonNullable',
};

// param?: Type = value → param: Type = value (TS doesn't allow optional + default)
function removeOptionalFromDefaults(params: any[]): void
{
	for (const param of params)
	{
		if (param.type === 'AssignmentPattern' && param.left?.optional)
		{
			param.left.optional = false;
		}
	}
}

export const flowTypesVisitor: TraverseOptions = {
	// * type → any
	ExistsTypeAnnotation(path)
	{
		path.replaceWith(t.anyTypeAnnotation());
	},

	// mixed → unknown
	MixedTypeAnnotation(path)
	{
		path.replaceWith(t.genericTypeAnnotation(t.identifier('unknown'), null));
	},

	GenericTypeAnnotation(path: NodePath<any>)
	{
		const typeName = path.node.id.name;

		// $Exact<T> → T
		if (typeName === '$Exact')
		{
			if (path.node.typeParameters?.params.length === 1)
			{
				path.replaceWith(path.node.typeParameters.params[0]);
			}

			return;
		}

		// $Call<F> → ReturnType<F>
		if (typeName === '$Call')
		{
			path.node.id.name = 'ReturnType';
			return;
		}

		// Simple renames: $Shape → Partial, $ReadOnly → Readonly, etc.
		if (SIMPLE_RENAMES[typeName])
		{
			path.node.id.name = SIMPLE_RENAMES[typeName];
			return;
		}

		// $Values, $Keys, $Diff, $PropertyType, $ElementType, Class<T>
		// are left as-is for text post-processing in the strategy
	},

	// opaque type → type
	OpaqueType(path: NodePath<t.OpaqueType>)
	{
		const id = path.node.id;
		const typeAnnotation = path.node.impltype;
		const replacement = t.typeAlias(id, null, typeAnnotation);
		path.replaceWith(replacement);
	},

	// ?T → T | null | undefined
	NullableTypeAnnotation: {
		exit(path)
		{
			let typeAnnotation: t.FlowType = path.node.typeAnnotation;

			// ?function → function is parsed as Identifier, not a FlowType
			if ((typeAnnotation as any).type === 'Identifier')
			{
				typeAnnotation = t.genericTypeAnnotation(typeAnnotation as any, null);
			}

			path.replaceWith(
				t.unionTypeAnnotation([
					typeAnnotation,
					t.nullLiteralTypeAnnotation(),
					t.voidTypeAnnotation(),
				]),
			);
		},
	},

	// declare type Foo = ... → type Foo = ...
	DeclareTypeAlias(path: NodePath<any>)
	{
		const replacement = t.typeAlias(path.node.id, path.node.typeParameters, path.node.right);
		path.replaceWith(replacement);
	},

	// { ...State, ...Getters, name: string } → State & Getters & { name: string }
	ObjectTypeAnnotation: {
		exit(path: NodePath<any>)
		{
			const spreads: any[] = [];
			const regular: any[] = [];

			for (const prop of path.node.properties)
			{
				if (prop.type === 'ObjectTypeSpreadProperty')
				{
					spreads.push(prop.argument);
				}
				else
				{
					regular.push(prop);
				}
			}

			if (spreads.length === 0)
			{
				return;
			}

			const parts: any[] = [...spreads];

			if (regular.length > 0 || path.node.indexers?.length > 0)
			{
				const remainingObject = t.objectTypeAnnotation(
					regular,
					path.node.indexers,
					path.node.callProperties,
				);
				remainingObject.exact = path.node.exact;
				parts.push(remainingObject);
			}

			if (parts.length === 1)
			{
				path.replaceWith(parts[0]);
			}
			else
			{
				path.replaceWith(t.intersectionTypeAnnotation(parts));
			}
		},
	},

	// Flow function type params without names: (string, number) => void → (arg0: string, arg1: number) => void
	FunctionTypeAnnotation(path: NodePath<any>)
	{
		for (let i = 0; i < path.node.params.length; i++)
		{
			const param = path.node.params[i];
			if (!param.name)
			{
				param.name = t.identifier(`arg${i}`);
			}
		}
	},

	// %checks → remove; optional + default → remove optional
	FunctionDeclaration(path: NodePath<any>)
	{
		if (path.node.predicate)
		{
			path.node.predicate = null;
		}

		removeOptionalFromDefaults(path.node.params);
	},

	// optional + default → remove optional (class methods, function expressions)
	FunctionExpression(path: NodePath<any>)
	{
		removeOptionalFromDefaults(path.node.params);
	},

	ArrowFunctionExpression(path: NodePath<any>)
	{
		removeOptionalFromDefaults(path.node.params);
	},

	ClassMethod(path: NodePath<any>)
	{
		removeOptionalFromDefaults(path.node.params);
	},
};
