import { parseSync, Visitor } from 'oxc-parser';

import type { Node as BabelNode } from '@babel/types';

import { parseJsFile, nodePosition, traverseShallow } from '../../utils/ast/parse-babel';

import type { BcdIndex } from './bcd-index';
import type { FeatureUsage } from './types';
import { findSyntaxFeature } from './syntax-map';
import { ESTREE_FACT_NODE_TYPES, filterOwners, isGuarded, ModuleFactsRecorder, ReceiverResolver } from './receiver-analysis';

import type { ModuleFacts } from './receiver-analysis';

type Position = { line: number; column: number; offset: number };

/**
 * A usage of a global name (`Promise.allSettled`, `new WeakRef`, `structuredClone()`) is only
 * reported when the module does not declare that name itself (`const Promise = require(...)`).
 *
 * `guardKeys` are the names a feature-detection condition around the usage would test for;
 * `methodName` and `receiver` describe an instance method call.
 */
type PendingUsage = {
	usage: FeatureUsage;
	globalName: string | null;
	offset: number;
	guardKeys: string[];
	methodName?: string;
	receiver?: unknown;
};

type CollectedUsages = {
	usages: PendingUsage[];
	declared: Set<string>;
	facts: ModuleFacts;
};

/**
 * Walks a parsed AST and emits a FeatureUsage entry for every reference that
 * matches a known BCD feature: static methods, constructors, globals, instance
 * methods and syntax.
 *
 * Oxc parses the module natively; `.js` is parsed as TypeScript, which also covers
 * the Flow annotations of Bitrix sources. Modules Oxc cannot parse (Flow-only syntax,
 * JSX in `.js`) fall back to Babel.
 *
 * `mayBeUnsupported` lets the caller drop usages that are supported whatever the receiver is, so the
 * receiver and guard analysis runs only for the rare modules that need it.
 */
export function extractFeatureUsages(
	code: string,
	id: string,
	index: BcdIndex,
	mayBeUnsupported: (usage: FeatureUsage) => boolean = () => true,
): FeatureUsage[]
{
	const pending = collectWithOxc(code, id, index) ?? collectWithBabel(code, id, index);
	if (!pending)
	{
		return [];
	}

	const { declared, facts } = pending;
	const usages = pending.usages.filter(({ usage, globalName }) => {
		return (globalName === null || !declared.has(globalName)) && mayBeUnsupported(usage);
	});

	if (usages.every(({ guardKeys }) => guardKeys.length === 0))
	{
		return usages.map(({ usage }) => usage);
	}

	const resolver = new ReceiverResolver(facts);

	return usages.flatMap((pendingUsage) => {
		if (isGuarded(facts, pendingUsage.offset, pendingUsage.guardKeys))
		{
			return [];
		}

		if (pendingUsage.usage.kind !== 'instanceMethod')
		{
			return [pendingUsage.usage];
		}

		const usage = narrowInstanceOwners(pendingUsage, resolver, index);

		return usage ? [usage] : [];
	});
}

/**
 * Keeps only the owners of the method the receiver may be an instance of: `this.move()` in a module
 * class is not `DisposableStack.prototype.move`, `new Set(a).union(b)` is only `Set.prototype.union`.
 */
function narrowInstanceOwners(pendingUsage: PendingUsage, resolver: ReceiverResolver, index: BcdIndex): FeatureUsage | null
{
	const { usage, methodName, receiver, offset } = pendingUsage;
	const owners = filterOwners(index.instanceMethods.get(methodName) ?? [], resolver.resolveExpression(receiver, offset));
	if (owners.length === 0)
	{
		return null;
	}

	return {
		...usage,
		bcdPath: ['javascript', 'builtins', owners[0].owner, methodName],
		owners,
	};
}

/**
 * Line and column of a usage; the offset only serves the analysis and stays out of the usage.
 */
function usagePosition({ line, column }: Position): { line: number; column: number }
{
	return { line, column };
}

function staticUsage(index: BcdIndex, ownerName: string, memberName: string, position: Position): PendingUsage | null
{
	const key = `${ownerName}.${memberName}`;
	if (!index.staticApis.has(key))
	{
		return null;
	}

	return {
		usage: {
			kind: 'static',
			label: key,
			bcdPath: ['javascript', 'builtins', ownerName, memberName],
			...usagePosition(position),
		},
		globalName: ownerName,
		offset: position.offset,
		guardKeys: [key],
	};
}

function constructorUsage(index: BcdIndex, name: string, position: Position): PendingUsage | null
{
	if (!index.constructors.has(name))
	{
		return null;
	}

	return {
		usage: {
			kind: 'constructor',
			label: name,
			bcdPath: ['javascript', 'builtins', name],
			...usagePosition(position),
		},
		globalName: name,
		offset: position.offset,
		guardKeys: [name],
	};
}

function globalUsage(index: BcdIndex, name: string, position: Position): PendingUsage | null
{
	if (!index.globalApis.has(name))
	{
		return null;
	}

	return {
		usage: {
			kind: 'global',
			label: name,
			bcdPath: ['api', name],
			...usagePosition(position),
		},
		globalName: name,
		offset: position.offset,
		guardKeys: [name],
	};
}

function instanceMethodUsage(index: BcdIndex, methodName: string, receiver: unknown, position: Position): PendingUsage | null
{
	const owners = index.instanceMethods.get(methodName);
	if (!owners)
	{
		return null;
	}

	return {
		usage: {
			kind: 'instanceMethod',
			label: `.${methodName}()`,
			bcdPath: ['javascript', 'builtins', owners[0].owner, methodName],
			owners,
			...usagePosition(position),
		},
		globalName: null,
		offset: position.offset,
		guardKeys: [methodName],
		methodName,
		receiver,
	};
}

// Syntax features (?., ??, ??=, &&=, ||=, **, ...spread) — checked via a small declarative
// AST-node → BCD-operator bridge. Not a feature whitelist: the rules are pure shape predicates
// that map syntactic node types to their formal BCD identifiers.
function syntaxUsage(node: unknown, position: Position): PendingUsage | null
{
	const found = findSyntaxFeature(node);
	if (!found)
	{
		return null;
	}

	return {
		usage: {
			kind: 'syntax',
			label: found.label,
			bcdPath: ['javascript', 'operators', found.bcdKey],
			...usagePosition(position),
		},
		globalName: null,
		offset: position.offset,
		guardKeys: [],
	};
}

/**
 * Names bound by a declaration: the identifier itself, or the top-level names of an object or
 * array pattern. Babel calls pattern properties `ObjectProperty`, ESTree calls them `Property`.
 */
function addDeclaredNames(id: any, names: Set<string>): void
{
	if (!id)
	{
		return;
	}

	if (id.type === 'Identifier')
	{
		names.add(id.name);
	}
	else if (id.type === 'ObjectPattern')
	{
		for (const prop of id.properties)
		{
			if ((prop.type === 'ObjectProperty' || prop.type === 'Property') && prop.value?.type === 'Identifier')
			{
				names.add(prop.value.name);
			}
			else if (prop.type === 'RestElement' && prop.argument.type === 'Identifier')
			{
				names.add(prop.argument.name);
			}
		}
	}
	else if (id.type === 'ArrayPattern')
	{
		for (const element of id.elements)
		{
			if (element?.type === 'Identifier')
			{
				names.add(element.name);
			}
		}
	}
}

function collectWithOxc(code: string, id: string, index: BcdIndex): CollectedUsages | null
{
	const lang = /\.[cm]?tsx$|\.jsx$/.test(id) ? 'tsx' : 'ts';
	const result = parseSync(id, code, { lang, sourceType: 'module' });
	if (result.errors.length > 0)
	{
		return null;
	}

	const lineStarts = computeLineStarts(code);
	const positionOf = (offset: number): Position => getPosition(lineStarts, offset);

	const usages: PendingUsage[] = [];
	const declared = new Set<string>();
	const push = (usage: PendingUsage | null): void => {
		if (usage) usages.push(usage);
	};

	// Babel represents the links of an optional chain as their own `Optional*` nodes, which the
	// checks below never looked at. ESTree keeps them as regular nodes inside a `ChainExpression`,
	// so the same links are skipped here.
	const optionalChainLinks = new Set<unknown>();

	const handlers: Record<string, (node: any) => void> = {
		VariableDeclarator(node: any) { addDeclaredNames(node.id, declared); },
		FunctionDeclaration(node: any) { if (node.id) declared.add(node.id.name); },
		ClassDeclaration(node: any) { if (node.id) declared.add(node.id.name); },
		ImportSpecifier(node: any) { declared.add(node.local.name); },
		ImportDefaultSpecifier(node: any) { declared.add(node.local.name); },
		ImportNamespaceSpecifier(node: any) { declared.add(node.local.name); },

		ChainExpression(node: any)
		{
			for (const link of getOptionalChainLinks(node))
			{
				optionalChainLinks.add(link);
			}

			push(syntaxUsage(node, positionOf(node.start)));
		},

		MemberExpression(node: any)
		{
			const { object, property, computed } = node;
			if (optionalChainLinks.has(node) || computed || object.type !== 'Identifier' || property.type !== 'Identifier')
			{
				return;
			}

			push(staticUsage(index, object.name, property.name, positionOf(node.start)));
		},

		NewExpression(node: any)
		{
			if (node.callee?.type === 'Identifier')
			{
				push(constructorUsage(index, node.callee.name, positionOf(node.start)));
			}
		},

		CallExpression(node: any)
		{
			const callee = node.callee;
			if (optionalChainLinks.has(node))
			{
				return;
			}

			if (callee.type === 'Identifier')
			{
				push(globalUsage(index, callee.name, positionOf(node.start)));
			}
			else if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier')
			{
				push(instanceMethodUsage(index, callee.property.name, callee.object, positionOf(callee.property.start)));
			}
		},

		LogicalExpression(node: any) { push(syntaxUsage(node, positionOf(node.start))); },
		AssignmentExpression(node: any) { push(syntaxUsage(node, positionOf(node.start))); },
		BinaryExpression(node: any) { push(syntaxUsage(node, positionOf(node.start))); },
		SpreadElement(node: any) { push(syntaxUsage(node, positionOf(node.start))); },
	};

	const recorder = new ModuleFactsRecorder();
	for (const type of ESTREE_FACT_NODE_TYPES)
	{
		const handler = handlers[type];
		handlers[type] = handler
			? (node: any) => { recorder.record(node); handler(node); }
			: (node: any) => recorder.record(node);
	}

	new Visitor(handlers).visit(result.program);

	return { usages, declared, facts: recorder.facts };
}

/**
 * The members and calls Babel turns into `Optional*` nodes: the chain from its outermost link
 * down to the innermost `?.`. Links below the innermost `?.` (`a.b` in `a.b?.c`) stay regular.
 */
function getOptionalChainLinks(chain: any): unknown[]
{
	const links: any[] = [];
	for (let node = chain.expression; node?.type === 'MemberExpression' || node?.type === 'CallExpression';)
	{
		links.push(node);
		node = node.type === 'MemberExpression' ? node.object : node.callee;
	}

	let innermostOptional = -1;
	links.forEach((link, position) => {
		if (link.optional) innermostOptional = position;
	});

	return links.slice(0, innermostOptional + 1);
}

function collectWithBabel(code: string, id: string, index: BcdIndex): CollectedUsages | null
{
	const ast = parseJsFile(code, id) as BabelNode | null;
	if (!ast)
	{
		return null;
	}

	const usages: PendingUsage[] = [];
	const declared = new Set<string>();
	const recorder = new ModuleFactsRecorder();
	const push = (usage: PendingUsage | null): void => {
		if (usage) usages.push(usage);
	};

	traverseShallow(ast, {
		VariableDeclarator(path: any) { addDeclaredNames(path.node.id, declared); },
		FunctionDeclaration(path: any) { if (path.node.id?.name) declared.add(path.node.id.name); },
		ClassDeclaration(path: any) { if (path.node.id?.name) declared.add(path.node.id.name); },
		ImportSpecifier(path: any) { declared.add(path.node.local.name); },
		ImportDefaultSpecifier(path: any) { declared.add(path.node.local.name); },
		ImportNamespaceSpecifier(path: any) { declared.add(path.node.local.name); },

		MemberExpression(path: any)
		{
			const { object, property, computed } = path.node;
			if (computed || object.type !== 'Identifier' || property.type !== 'Identifier')
			{
				return;
			}

			push(staticUsage(index, object.name, property.name, babelPosition(path.node)));
		},

		NewExpression(path: any)
		{
			const callee = path.node.callee;
			if (callee?.type === 'Identifier')
			{
				push(constructorUsage(index, callee.name, babelPosition(path.node)));
			}
		},

		enter(path: any)
		{
			recorder.record(path.node);
			push(syntaxUsage(path.node, babelPosition(path.node)));
		},

		CallExpression(path: any)
		{
			const callee = path.node.callee;
			if (callee.type === 'Identifier')
			{
				push(globalUsage(index, callee.name, babelPosition(path.node)));
			}
			else if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier')
			{
				push(instanceMethodUsage(index, callee.property.name, callee.object, babelPosition(callee.property)));
			}
		},
	});

	return { usages, declared, facts: recorder.facts };
}

function babelPosition(node: BabelNode): Position
{
	return { ...nodePosition(node), offset: node.start ?? 0 };
}

function computeLineStarts(code: string): number[]
{
	const starts = [0];
	for (let offset = code.indexOf('\n'); offset !== -1; offset = code.indexOf('\n', offset + 1))
	{
		starts.push(offset + 1);
	}

	return starts;
}

/**
 * 1-based line and 0-based column, as Babel reports them.
 */
function getPosition(lineStarts: number[], offset: number): Position
{
	let low = 0;
	let high = lineStarts.length - 1;
	while (low < high)
	{
		const middle = (low + high + 1) >> 1;
		if (lineStarts[middle] <= offset)
		{
			low = middle;
		}
		else
		{
			high = middle - 1;
		}
	}

	return { line: low + 1, column: offset - lineStarts[low], offset };
}
