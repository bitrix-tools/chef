import { parseSync, Visitor } from 'oxc-parser';

import type { Node as BabelNode } from '@babel/types';

import { parseJsFile, nodePosition, traverseShallow } from '../../utils/ast/parse-babel';

import type { BcdIndex } from './bcd-index';
import type { FeatureUsage } from './types';
import { findSyntaxFeature } from './syntax-map';

type Position = { line: number; column: number };

/**
 * A usage of a global name (`Promise.allSettled`, `new WeakRef`, `structuredClone()`) is only
 * reported when the module does not declare that name itself (`const Promise = require(...)`).
 */
type PendingUsage = {
	usage: FeatureUsage;
	globalName: string | null;
};

/**
 * Walks a parsed AST and emits a FeatureUsage entry for every reference that
 * matches a known BCD feature: static methods, constructors, globals, instance
 * methods and syntax.
 *
 * Oxc parses the module natively; `.js` is parsed as TypeScript, which also covers
 * the Flow annotations of Bitrix sources. Modules Oxc cannot parse (Flow-only syntax,
 * JSX in `.js`) fall back to Babel.
 */
export function extractFeatureUsages(code: string, id: string, index: BcdIndex): FeatureUsage[]
{
	const pending = collectWithOxc(code, id, index) ?? collectWithBabel(code, id, index);
	if (!pending)
	{
		return [];
	}

	const { usages, declared } = pending;

	return usages
		.filter(({ globalName }) => globalName === null || !declared.has(globalName))
		.map(({ usage }) => usage);
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
			...position,
		},
		globalName: ownerName,
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
			...position,
		},
		globalName: name,
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
			...position,
		},
		globalName: name,
	};
}

function instanceMethodUsage(index: BcdIndex, methodName: string, position: Position): PendingUsage | null
{
	const ownerInfo = index.instanceMethods.get(methodName);
	if (!ownerInfo)
	{
		return null;
	}

	const owners = ownerInfo.map(({ owner }) => `${owner}.prototype.${methodName}`);
	const ownerLabel = owners.length <= 2
		? owners.join(' / ')
		: owners[0];

	return {
		usage: {
			kind: 'instanceMethod',
			label: `.${methodName}()`,
			bcdPath: ['javascript', 'builtins', ownerInfo[0].owner, methodName],
			ownerLabel,
			ownerLabels: owners,
			...position,
		},
		globalName: null,
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
			...position,
		},
		globalName: null,
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

function collectWithOxc(code: string, id: string, index: BcdIndex): { usages: PendingUsage[]; declared: Set<string> } | null
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

	const visitor = new Visitor({
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
				push(instanceMethodUsage(index, callee.property.name, positionOf(callee.property.start)));
			}
		},

		LogicalExpression(node: any) { push(syntaxUsage(node, positionOf(node.start))); },
		AssignmentExpression(node: any) { push(syntaxUsage(node, positionOf(node.start))); },
		BinaryExpression(node: any) { push(syntaxUsage(node, positionOf(node.start))); },
		SpreadElement(node: any) { push(syntaxUsage(node, positionOf(node.start))); },
	});

	visitor.visit(result.program);

	return { usages, declared };
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

function collectWithBabel(code: string, id: string, index: BcdIndex): { usages: PendingUsage[]; declared: Set<string> } | null
{
	const ast = parseJsFile(code, id) as BabelNode | null;
	if (!ast)
	{
		return null;
	}

	const usages: PendingUsage[] = [];
	const declared = new Set<string>();
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

			push(staticUsage(index, object.name, property.name, nodePosition(path.node)));
		},

		NewExpression(path: any)
		{
			const callee = path.node.callee;
			if (callee?.type === 'Identifier')
			{
				push(constructorUsage(index, callee.name, nodePosition(path.node)));
			}
		},

		enter(path: any)
		{
			push(syntaxUsage(path.node, nodePosition(path.node)));
		},

		CallExpression(path: any)
		{
			const callee = path.node.callee;
			if (callee.type === 'Identifier')
			{
				push(globalUsage(index, callee.name, nodePosition(path.node)));
			}
			else if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier')
			{
				const start = callee.property.loc?.start;
				push(instanceMethodUsage(index, callee.property.name, { line: start?.line ?? 1, column: start?.column ?? 0 }));
			}
		},
	});

	return { usages, declared };
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

	return { line: low + 1, column: offset - lineStarts[low] };
}
