/**
 * Lightweight, module-local reasoning about the object a method is called on, and about
 * feature-detection guards. Works on both ESTree (Oxc) and Babel ASTs.
 *
 * Without type information `x.use()` matches `DisposableStack.prototype.use` just by name. The
 * analysis narrows such matches:
 * - when the receiver type is evident from the module (a literal, `new X()`, `Array.from()`,
 *   a variable or `this.field` bound to one of those, a TS/Flow annotation, `this` inside a class),
 *   only that type is checked;
 * - when it is not, only builtins whose instances commonly flow through untyped code are checked.
 *   Iterators, disposable stacks, buffers and the like are reported only when the receiver is
 *   proven to be one.
 */

/**
 * Builtins whose instances commonly come from literals, other modules or platform APIs, so an
 * untyped receiver may well be one of them.
 */
const AMBIENT_OWNERS = new Set([
	'Array',
	'String',
	'Number',
	'BigInt',
	'Boolean',
	'Symbol',
	'Object',
	'Function',
	'Promise',
	'RegExp',
	'Date',
	'Error',
	'Map',
	'Set',
	'WeakMap',
	'WeakSet',
	'TypedArray',
	'Uint8Array',
]);

const TYPED_ARRAYS = new Set([
	'Int8Array',
	'Uint8Array',
	'Uint8ClampedArray',
	'Int16Array',
	'Uint16Array',
	'Int32Array',
	'Uint32Array',
	'Float16Array',
	'Float32Array',
	'Float64Array',
	'BigInt64Array',
	'BigUint64Array',
]);

/**
 * Type names that describe iterators in TS and Flow annotations.
 */
const ITERATOR_TYPE_NAMES = new Set([
	'Iterator',
	'IterableIterator',
	'IteratorObject',
	'ArrayIterator',
	'MapIterator',
	'SetIterator',
	'StringIterator',
	'RegExpStringIterator',
	'Generator',
]);

/**
 * Methods that return an iterator when called on an array, a map, a set or a string.
 */
const ITERATOR_RETURNING_METHODS = new Set(['values', 'keys', 'entries', 'matchAll']);

/**
 * Builtins whose static `from()` / `of()` return an instance of the builtin itself.
 */
const SELF_FACTORY_METHODS = new Set(['from', 'of']);

/**
 * Builtins the receiver may be an instance of. `includesAmbient` means the receiver may also be
 * anything else, so every ambient owner stays possible.
 */
export interface ReceiverOwners
{
	names: Set<string>;
	includesAmbient: boolean;
}

const UNKNOWN: ReceiverOwners = { names: new Set(), includesAmbient: true };

/**
 * A receiver known not to be a builtin instance: an instance of a module class, an object literal.
 */
const NOT_BUILTIN: ReceiverOwners = { names: new Set(), includesAmbient: false };

type TypeSource =
	| { expression: any; annotation?: undefined }
	| { annotation: any; expression?: undefined }
	| null;

interface ThisScope
{
	start: number;
	end: number;
	classNode: any | null;
}

interface Guard
{
	start: number;
	end: number;
	keys: Set<string>;
}

export interface ModuleFacts
{
	/** Every source a module-level name may get its value from; `null` is an unknown source. */
	bindings: Map<string, TypeSource[]>;

	/** Every source a `this.<name>` field may get its value from. */
	fields: Map<string, TypeSource[]>;

	/** Names declared by the module itself: classes, functions, variables, imports. */
	declared: Set<string>;

	typeAliases: Set<string>;
	thisScopes: ThisScope[];
	guards: Guard[];

	/** References that only detect a feature (`typeof X.foo`, `if (X.foo)`), as `<offset>:<name>`. */
	detections: Set<string>;
}

/**
 * ESTree node types the facts are recorded from, for the Oxc visitor that dispatches by type.
 * A Babel traversal passes every node.
 */
export const ESTREE_FACT_NODE_TYPES = [
	'VariableDeclarator',
	'AssignmentExpression',
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
	'MethodDefinition',
	'TSAbstractMethodDefinition',
	'ClassDeclaration',
	'ClassExpression',
	'PropertyDefinition',
	'ImportSpecifier',
	'ImportDefaultSpecifier',
	'ImportNamespaceSpecifier',
	'CatchClause',
	'TSTypeAliasDeclaration',
	'TSInterfaceDeclaration',
	'IfStatement',
	'ConditionalExpression',
	'LogicalExpression',
	'UnaryExpression',
] as const;

/**
 * Records bindings, `this` scopes and feature-detection guards while the module AST is visited.
 * Nodes must come parents first, as both Oxc and Babel visitors deliver them.
 */
export class ModuleFactsRecorder
{
	readonly facts: ModuleFacts = {
		bindings: new Map(),
		fields: new Map(),
		declared: new Set(),
		typeAliases: new Set(),
		thisScopes: [],
		guards: [],
		detections: new Set(),
	};

	/** ESTree method values: their `this` is the one of the class, not their own. */
	readonly #methodFunctions = new Set<unknown>();

	record(node: any): void
	{
		if (node.type === 'MethodDefinition' || node.type === 'TSAbstractMethodDefinition')
		{
			this.#methodFunctions.add(node.value);

			return;
		}

		recordNode(node, this.#methodFunctions.has(node), this.facts);
	}
}

function addSource(map: Map<string, TypeSource[]>, name: string, source: TypeSource): void
{
	const sources = map.get(name);
	if (sources)
	{
		sources.push(source);
	}
	else
	{
		map.set(name, [source]);
	}
}

function recordNode(node: any, isMethodFunction: boolean, facts: ModuleFacts): void
{
	switch (node.type)
	{
		case 'VariableDeclarator':
			recordPattern(node.id, node.init ? { expression: node.init } : null, facts);
			break;

		case 'AssignmentExpression':
			recordAssignment(node, facts);
			break;

		case 'FunctionDeclaration':
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
		case 'ObjectMethod':
		case 'ClassMethod':
		case 'ClassPrivateMethod':
			recordFunction(node, isMethodFunction, facts);
			break;

		case 'ClassDeclaration':
		case 'ClassExpression':
			if (node.id)
			{
				facts.declared.add(node.id.name);
				addSource(facts.bindings, node.id.name, { expression: node });
			}

			facts.thisScopes.push({ start: node.start, end: node.end, classNode: node });
			break;

		case 'PropertyDefinition':
		case 'ClassProperty':
		case 'ClassPrivateProperty':
			recordClassField(node, facts);
			break;

		case 'ImportSpecifier':
		case 'ImportDefaultSpecifier':
		case 'ImportNamespaceSpecifier':
			facts.declared.add(node.local.name);
			addSource(facts.bindings, node.local.name, null);
			break;

		case 'CatchClause':
			recordPattern(node.param, null, facts);
			break;

		case 'TSTypeAliasDeclaration':
		case 'TSInterfaceDeclaration':
		case 'TypeAlias':
		case 'OpaqueType':
		case 'InterfaceDeclaration':
			if (node.id?.name)
			{
				facts.typeAliases.add(node.id.name);
			}
			break;

		case 'IfStatement':
		case 'ConditionalExpression':
			recordGuard(node.test, [node.consequent, node.alternate], facts);
			break;

		case 'LogicalExpression':
			if (node.operator === '&&')
			{
				recordGuard(node.left, [node.right], facts);
			}
			break;

		case 'UnaryExpression':
			if (node.operator === 'typeof')
			{
				collectGuardKeys(node.argument, new Set(), facts.detections);
			}
			break;

		default:
			break;
	}
}

function recordPattern(pattern: any, source: TypeSource, facts: ModuleFacts): void
{
	if (!pattern)
	{
		return;
	}

	switch (pattern.type)
	{
		case 'Identifier':
			facts.declared.add(pattern.name);
			addSource(facts.bindings, pattern.name, pattern.typeAnnotation ? { annotation: pattern.typeAnnotation } : source);
			break;

		case 'AssignmentPattern':
			recordPattern(pattern.left, null, facts);
			if (pattern.left?.type === 'Identifier' && !pattern.left.typeAnnotation)
			{
				addSource(facts.bindings, pattern.left.name, { expression: pattern.right });
			}
			break;

		case 'ObjectPattern':
			for (const property of pattern.properties)
			{
				recordPattern(property.type === 'RestElement' ? property.argument : property.value, null, facts);
			}
			break;

		case 'ArrayPattern':
			for (const element of pattern.elements)
			{
				recordPattern(element, null, facts);
			}
			break;

		case 'RestElement':
			recordPattern(pattern.argument, null, facts);
			break;

		case 'TSParameterProperty':
			recordPattern(pattern.parameter, null, facts);
			break;

		default:
			break;
	}
}

function recordAssignment(node: any, facts: ModuleFacts): void
{
	const source: TypeSource = node.operator === '=' ? { expression: node.right } : null;
	const left = node.left;

	if (left.type === 'Identifier')
	{
		addSource(facts.bindings, left.name, source);
	}
	else if (left.type === 'MemberExpression' && left.object.type === 'ThisExpression' && !left.computed)
	{
		const name = memberName(left.property);
		if (name)
		{
			addSource(facts.fields, name, source);
		}
	}
	else
	{
		recordPattern(left, null, facts);
	}
}

function recordFunction(node: any, isMethodFunction: boolean, facts: ModuleFacts): void
{
	if (node.type === 'FunctionDeclaration' && node.id)
	{
		facts.declared.add(node.id.name);
		addSource(facts.bindings, node.id.name, { expression: node });
	}

	for (const param of node.params ?? [])
	{
		recordPattern(param, null, facts);
	}

	// Arrow functions keep `this`; class methods keep the class `this` the class scope provides.
	const isClassMethod = node.type === 'ClassMethod' || node.type === 'ClassPrivateMethod' || isMethodFunction;

	if (node.type !== 'ArrowFunctionExpression' && !isClassMethod)
	{
		facts.thisScopes.push({ start: node.start, end: node.end, classNode: null });
	}
}

function recordClassField(node: any, facts: ModuleFacts): void
{
	const name = memberName(node.key);
	if (!name || node.static)
	{
		return;
	}

	if (node.typeAnnotation)
	{
		addSource(facts.fields, name, { annotation: node.typeAnnotation });
	}
	else
	{
		addSource(facts.fields, name, node.value ? { expression: node.value } : null);
	}
}

/**
 * Name of a non-computed member: `foo` for `x.foo`, `#foo` for `x.#foo` (ESTree and Babel).
 */
function memberName(property: any): string | null
{
	switch (property?.type)
	{
		case 'Identifier':
			return property.name;
		case 'PrivateIdentifier':
			return `#${property.name}`;
		case 'PrivateName':
			return `#${property.id.name}`;
		default:
			return null;
	}
}

function recordGuard(test: any, branches: any[], facts: ModuleFacts): void
{
	const keys = new Set<string>();
	collectGuardKeys(test, keys, facts.detections);
	if (keys.size === 0)
	{
		return;
	}

	for (const branch of branches)
	{
		if (branch)
		{
			facts.guards.push({ start: branch.start, end: branch.end, keys });
		}
	}
}

/**
 * Names a condition tests for: `foo` and `X.foo` for `X.foo`, `typeof X.foo`, `'foo' in X`;
 * `foo` for a bare identifier. Callees are skipped — calling a method is using it, not detecting it.
 * `references` gets the tested references themselves, as `<offset>:<name>`.
 */
function collectGuardKeys(node: any, keys: Set<string>, references: Set<string>): void
{
	if (!node)
	{
		return;
	}

	switch (node.type)
	{
		case 'Identifier':
			keys.add(node.name);
			references.add(`${node.start}:${node.name}`);
			return;

		case 'MemberExpression':
		case 'OptionalMemberExpression':
		{
			const name = node.computed ? null : memberName(node.property);
			if (name)
			{
				keys.add(name);
				references.add(`${node.start}:${name}`);
				if (node.object.type === 'Identifier')
				{
					keys.add(`${node.object.name}.${name}`);
					references.add(`${node.start}:${node.object.name}.${name}`);
				}
			}

			collectGuardKeys(node.object, keys, references);

			return;
		}

		case 'CallExpression':
		case 'OptionalCallExpression':
			if (node.callee.type === 'MemberExpression' || node.callee.type === 'OptionalMemberExpression')
			{
				collectGuardKeys(node.callee.object, keys, references);
			}

			for (const argument of node.arguments)
			{
				collectGuardKeys(argument, keys, references);
			}

			return;

		case 'BinaryExpression':
			if (node.operator === 'in' && typeof stringValue(node.left) === 'string')
			{
				const name = stringValue(node.left);
				keys.add(name);
				if (node.right.type === 'Identifier')
				{
					keys.add(`${node.right.name}.${name}`);
				}
			}

			collectGuardKeys(node.left, keys, references);
			collectGuardKeys(node.right, keys, references);

			return;

		case 'UnaryExpression':
			collectGuardKeys(node.argument, keys, references);
			return;

		case 'LogicalExpression':
			collectGuardKeys(node.left, keys, references);
			collectGuardKeys(node.right, keys, references);
			return;

		case 'ChainExpression':
		case 'ParenthesizedExpression':
			collectGuardKeys(node.expression, keys, references);
			return;

		default:
			return;
	}
}

function stringValue(node: any): string | undefined
{
	if (node.type === 'StringLiteral' || (node.type === 'Literal' && typeof node.value === 'string'))
	{
		return node.value;
	}

	return undefined;
}

/**
 * Whether a usage at `offset` detects the feature, or sits in a branch whose condition tests
 * for one of `keys`.
 */
export function isGuarded(facts: ModuleFacts, offset: number, keys: string[]): boolean
{
	if (keys.some((key) => facts.detections.has(`${offset}:${key}`)))
	{
		return true;
	}

	return facts.guards.some((guard) => {
		return offset >= guard.start && offset < guard.end && keys.some((key) => guard.keys.has(key));
	});
}


function knownOwner(name: string): ReceiverOwners
{
	const names = new Set([name]);
	if (TYPED_ARRAYS.has(name))
	{
		names.add('TypedArray');
	}

	if (name === 'Iterator')
	{
		names.add('Generator');
	}

	return { names, includesAmbient: false };
}

function iteratorOrAnything(): ReceiverOwners
{
	return { names: new Set(['Iterator', 'Generator']), includesAmbient: true };
}

function merge(owners: ReceiverOwners[]): ReceiverOwners
{
	if (owners.length === 0)
	{
		return UNKNOWN;
	}

	const names = new Set<string>();
	let includesAmbient = false;
	for (const item of owners)
	{
		item.names.forEach((name) => names.add(name));
		includesAmbient ||= item.includesAmbient;
	}

	return { names, includesAmbient };
}

/**
 * Builtin constructors the module itself does not redeclare.
 */
const BUILTIN_CONSTRUCTORS = new Set([
	...AMBIENT_OWNERS,
	...TYPED_ARRAYS,
	'Iterator',
	'ArrayBuffer',
	'SharedArrayBuffer',
	'DataView',
	'WeakRef',
	'FinalizationRegistry',
	'DisposableStack',
	'AsyncDisposableStack',
	'AggregateError',
]);

/**
 * Resolves the builtins an expression may evaluate to an instance of. Binding results are cached,
 * so one resolver serves every usage of a module.
 */
export class ReceiverResolver
{
	readonly #facts: ModuleFacts;

	/** Bindings being resolved, to stop on cycles like `a = b; b = a`. */
	readonly #resolving = new Set<string>();

	readonly #resolved = new Map<string, ReceiverOwners>();

	constructor(facts: ModuleFacts)
	{
		this.#facts = facts;
	}

	resolveExpression(node: any, offset: number): ReceiverOwners
	{
		if (!node)
		{
			return UNKNOWN;
		}

		switch (node.type)
		{
			case 'ArrayExpression':
				return knownOwner('Array');

			case 'StringLiteral':
			case 'TemplateLiteral':
				return knownOwner('String');

			case 'RegExpLiteral':
				return knownOwner('RegExp');

			case 'NumericLiteral':
				return knownOwner('Number');

			case 'Literal':
				return this.#resolveLiteral(node);

			case 'ObjectExpression':
			case 'ClassExpression':
			case 'ClassDeclaration':
				return NOT_BUILTIN;

			case 'FunctionExpression':
			case 'FunctionDeclaration':
			case 'ArrowFunctionExpression':
				return knownOwner('Function');

			case 'NewExpression':
				return this.#resolveConstruction(node.callee);

			case 'CallExpression':
				return this.#resolveCall(node);

			case 'ThisExpression':
				return this.#resolveThis(offset);

			case 'Identifier':
				return this.#resolveBinding(this.#facts.bindings, node.name);

			case 'MemberExpression':
				return this.#resolveMember(node);

			case 'ParenthesizedExpression':
			case 'TSNonNullExpression':
			case 'ChainExpression':
				return this.resolveExpression(node.expression, offset);

			case 'TSAsExpression':
			case 'TSSatisfiesExpression':
			case 'TSTypeAssertion':
			case 'TypeCastExpression':
				return this.#resolveAnnotation(node.typeAnnotation);

			case 'ConditionalExpression':
				return merge([this.resolveExpression(node.consequent, offset), this.resolveExpression(node.alternate, offset)]);

			case 'AssignmentExpression':
				return node.operator === '=' ? this.resolveExpression(node.right, offset) : UNKNOWN;

			case 'SequenceExpression':
				return this.resolveExpression(node.expressions.at(-1), offset);

			default:
				return UNKNOWN;
		}
	}

	#resolveLiteral(node: any): ReceiverOwners
	{
		if (node.regex)
		{
			return knownOwner('RegExp');
		}

		switch (typeof node.value)
		{
			case 'string':
				return knownOwner('String');
			case 'number':
				return knownOwner('Number');
			case 'boolean':
				return knownOwner('Boolean');
			default:
				return UNKNOWN;
		}
	}

	#isBuiltin(name: string): boolean
	{
		return BUILTIN_CONSTRUCTORS.has(name) && !this.#facts.declared.has(name);
	}

	#resolveConstruction(callee: any): ReceiverOwners
	{
		if (callee?.type !== 'Identifier')
		{
			return NOT_BUILTIN;
		}

		return this.#isBuiltin(callee.name) ? knownOwner(callee.name) : NOT_BUILTIN;
	}

	#resolveCall(node: any): ReceiverOwners
	{
		const callee = node.callee;
		if (callee.type !== 'MemberExpression' || callee.computed)
		{
			return UNKNOWN;
		}

		const method = memberName(callee.property);
		const object = callee.object;

		if (object.type === 'Identifier' && this.#isBuiltin(object.name))
		{
			if (object.name === 'Object' && ITERATOR_RETURNING_METHODS.has(method))
			{
				return knownOwner('Array');
			}

			if (SELF_FACTORY_METHODS.has(method))
			{
				return knownOwner(object.name);
			}

			return UNKNOWN;
		}

		if (ITERATOR_RETURNING_METHODS.has(method))
		{
			return iteratorOrAnything();
		}

		return UNKNOWN;
	}

	#resolveThis(offset: number): ReceiverOwners
	{
		let innermost: ThisScope | null = null;
		for (const scope of this.#facts.thisScopes)
		{
			if (offset >= scope.start && offset < scope.end && (!innermost || scope.start >= innermost.start))
			{
				innermost = scope;
			}
		}

		if (!innermost?.classNode)
		{
			return UNKNOWN;
		}

		const superClass = innermost.classNode.superClass;
		if (!superClass)
		{
			return NOT_BUILTIN;
		}

		return superClass.type === 'Identifier' && this.#isBuiltin(superClass.name)
			? knownOwner(superClass.name)
			: NOT_BUILTIN;
	}

	#resolveMember(node: any): ReceiverOwners
	{
		const name = node.computed ? null : memberName(node.property);
		if (!name || node.object.type !== 'ThisExpression')
		{
			return UNKNOWN;
		}

		return this.#resolveBinding(this.#facts.fields, name, 'this.');
	}

	#resolveBinding(map: Map<string, TypeSource[]>, name: string, prefix = ''): ReceiverOwners
	{
		const sources = map.get(name);
		const key = prefix + name;
		if (!sources || this.#resolving.has(key))
		{
			return UNKNOWN;
		}

		const cached = this.#resolved.get(key);
		if (cached)
		{
			return cached;
		}

		this.#resolving.add(key);
		const owners = merge(sources.map((source) => {
			if (source === null)
			{
				return UNKNOWN;
			}

			// `this` in the assigned value refers to the scope of the assignment, not of the usage.
			return source.annotation
				? this.#resolveAnnotation(source.annotation)
				: this.resolveExpression(source.expression, source.expression.start);
		}));
		this.#resolving.delete(key);
		this.#resolved.set(key, owners);

		return owners;
	}

	#resolveAnnotation(node: any): ReceiverOwners
	{
		if (!node)
		{
			return UNKNOWN;
		}

		switch (node.type)
		{
			case 'TSTypeAnnotation':
			case 'TypeAnnotation':
			case 'NullableTypeAnnotation':
			case 'TSParenthesizedType':
				return this.#resolveAnnotation(node.typeAnnotation);

			case 'TSArrayType':
			case 'TSTupleType':
			case 'ArrayTypeAnnotation':
			case 'TupleTypeAnnotation':
				return knownOwner('Array');

			case 'TSStringKeyword':
			case 'StringTypeAnnotation':
			case 'StringLiteralTypeAnnotation':
				return knownOwner('String');

			case 'TSNumberKeyword':
			case 'NumberTypeAnnotation':
				return knownOwner('Number');

			case 'TSBooleanKeyword':
			case 'BooleanTypeAnnotation':
				return knownOwner('Boolean');

			case 'TSFunctionType':
			case 'FunctionTypeAnnotation':
				return knownOwner('Function');

			case 'TSTypeLiteral':
			case 'ObjectTypeAnnotation':
				return NOT_BUILTIN;

			case 'TSUnionType':
			case 'UnionTypeAnnotation':
				return merge(node.types
					.filter((type: any) => !isNullishType(type))
					.map((type: any) => this.#resolveAnnotation(type)));

			case 'TSTypeReference':
				return this.#resolveTypeName(node.typeName, node.typeArguments ?? node.typeParameters);

			case 'GenericTypeAnnotation':
				return this.#resolveTypeName(node.id, node.typeParameters);

			default:
				return UNKNOWN;
		}
	}

	#resolveTypeName(typeName: any, typeArguments: any): ReceiverOwners
	{
		if (typeName?.type !== 'Identifier')
		{
			// `BX.Foo`, `Namespace.Type` — a type of the product, not a builtin.
			return NOT_BUILTIN;
		}

		const name = typeName.name;
		if (name === 'Array' || name === 'ReadonlyArray' || name === '$ReadOnlyArray')
		{
			return knownOwner('Array');
		}

		if (ITERATOR_TYPE_NAMES.has(name))
		{
			return knownOwner('Iterator');
		}

		if (name === 'Iterable')
		{
			return iteratorOrAnything();
		}

		if (name === 'ReadonlySet' || name === 'ReadonlyMap')
		{
			return knownOwner(name.slice('Readonly'.length));
		}

		if (this.#isBuiltin(name))
		{
			return knownOwner(name);
		}

		// Aliases and interfaces may stand for anything; so may generic helpers like `Partial<T>`.
		if (this.#facts.typeAliases.has(name) || typeArguments)
		{
			return UNKNOWN;
		}

		return NOT_BUILTIN;
	}
}

function isNullishType(node: any): boolean
{
	return node.type === 'TSNullKeyword'
		|| node.type === 'TSUndefinedKeyword'
		|| node.type === 'TSVoidKeyword'
		|| node.type === 'NullLiteralTypeAnnotation'
		|| node.type === 'VoidTypeAnnotation';
}

/**
 * Narrows the owners of a method name to those the receiver may be an instance of.
 */
export function filterOwners<T extends { owner: string }>(owners: T[], receiver: ReceiverOwners): T[]
{
	return owners.filter(({ owner }) => {
		return receiver.names.has(owner) || (receiver.includesAmbient && AMBIENT_OWNERS.has(owner));
	});
}
