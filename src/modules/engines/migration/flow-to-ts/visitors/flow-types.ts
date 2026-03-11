import * as t from '@babel/types';

import type { NodePath } from '@babel/traverse';
import type { TraverseOptions } from '@babel/traverse';

export const flowTypesVisitor: TraverseOptions = {
	ExistsTypeAnnotation(path)
	{
		path.replaceWith(t.anyTypeAnnotation());
	},

	OpaqueType(path: NodePath<t.OpaqueType>)
	{
		const id = path.node.id;
		const typeAnnotation = path.node.impltype;
		const replacement = t.typeAlias(id, null, typeAnnotation);
		path.replaceWith(replacement);
	},

	GenericTypeAnnotation(path: NodePath<any>)
	{
		const typeName = path.node.id.name;

		if (typeName === '$Exact')
		{
			if (path.node.typeParameters && path.node.typeParameters.params.length === 1)
			{
				path.replaceWith(path.node.typeParameters.params[0]);
			}
		}
		else if (typeName === '$Shape')
		{
			path.node.id.name = 'Partial';
		}
		else if (typeName === '$ReadOnly')
		{
			path.node.id.name = 'Readonly';
		}
		else if (typeName === '$ReadOnlyArray')
		{
			path.node.id.name = 'ReadonlyArray';
		}
	},

	NullableTypeAnnotation: {
		exit(path)
		{
			const { typeAnnotation } = path.node;

			path.replaceWith(
				t.unionTypeAnnotation([
					typeAnnotation,
					t.nullLiteralTypeAnnotation(),
					t.voidTypeAnnotation(),
				]),
			);
		},
	},
};
