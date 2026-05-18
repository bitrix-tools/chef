import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

import type { Node as BabelNode } from '@babel/types';

// @babel/traverse is CommonJS; under ESM it exposes the function on `.default`,
// while under CJS the import already IS the function. Normalize both.
const traverse: typeof _traverse = (_traverse as any).default ?? _traverse;

import type { BcdIndex } from './bcd-index';
import type { FeatureUsage } from './types';
import { findSyntaxFeature } from './syntax-map';

interface Position
{
	line: number;
	column: number;
}

function nodePosition(node: BabelNode): Position
{
	const loc = node.loc?.start;

	return {
		line: loc?.line ?? 1,
		// Babel columns are 0-based, which matches the legacy regex-based
		// column reporting in the previous baseline checker.
		column: loc?.column ?? 0,
	};
}

function tryParse(code: string, plugins: any[]): BabelNode | null
{
	try
	{
		return parse(code, {
			sourceType: 'module',
			allowReturnOutsideFunction: true,
			allowAwaitOutsideFunction: true,
			allowImportExportEverywhere: true,
			errorRecovery: true,
			plugins,
		}) as unknown as BabelNode;
	}
	catch
	{
		return null;
	}
}

function parseSource(code: string, isTypeScript: boolean, isJsx: boolean): BabelNode | null
{
	const baseCommon = ['classProperties', 'classPrivateProperties', 'classPrivateMethods', 'decorators-legacy', 'topLevelAwait'];

	if (isTypeScript)
	{
		const plugins = isJsx
			? [...baseCommon, ['typescript', { isTSX: true, allExtensions: true } as any], 'jsx']
			: [...baseCommon, 'typescript'];

		return tryParse(code, plugins);
	}

	// JS file. Babel can't mix Flow + TypeScript or Flow + JSX without
	// dedicated plugin tweaks, so try the popular combinations in order:
	// JSX (most common in modern codebases) → Flow + JSX (legacy modules
	// like ui.bbcode.parser use Flow type annotations in .js files).
	const tsResult = tryParse(code, [...baseCommon, 'jsx']);
	if (tsResult !== null)
	{
		return tsResult;
	}

	return tryParse(code, [...baseCommon, 'flow', 'jsx']);
}

/**
 * Collects identifier names declared anywhere in the module so that
 * shadowed globals (e.g. `const Promise = require('bluebird')`) do not
 * trigger false positives.
 */
function collectDeclaredNames(root: BabelNode): Set<string>
{
	const names = new Set<string>();

	traverse(root as any, {
		VariableDeclarator(path: any)
		{
			const id = path.node.id;
			if (id && id.type === 'Identifier')
			{
				names.add(id.name);
			}
			else if (id && id.type === 'ObjectPattern')
			{
				for (const prop of id.properties)
				{
					if (prop.type === 'ObjectProperty' && prop.value && prop.value.type === 'Identifier')
					{
						names.add(prop.value.name);
					}
					else if (prop.type === 'RestElement' && prop.argument.type === 'Identifier')
					{
						names.add(prop.argument.name);
					}
				}
			}
			else if (id && id.type === 'ArrayPattern')
			{
				for (const el of id.elements)
				{
					if (el && el.type === 'Identifier')
					{
						names.add(el.name);
					}
				}
			}
		},
		FunctionDeclaration(path: any)
		{
			if (path.node.id?.name)
			{
				names.add(path.node.id.name);
			}
		},
		ClassDeclaration(path: any)
		{
			if (path.node.id?.name)
			{
				names.add(path.node.id.name);
			}
		},
		ImportSpecifier(path: any) { names.add(path.node.local.name); },
		ImportDefaultSpecifier(path: any) { names.add(path.node.local.name); },
		ImportNamespaceSpecifier(path: any) { names.add(path.node.local.name); },
	});

	return names;
}

/**
 * Walks a parsed AST and emits a FeatureUsage entry for every reference that
 * matches a known BCD feature: static methods, constructors, globals and
 * instance methods.
 */
export function extractFeatureUsages(code: string, id: string, index: BcdIndex): FeatureUsage[]
{
	const isTypeScript = /\.(ts|tsx|mts|cts)$/.test(id);
	const isJsx = /\.(jsx|tsx)$/.test(id);
	const ast = parseSource(code, isTypeScript, isJsx);
	if (!ast)
	{
		return [];
	}

	const declared = collectDeclaredNames(ast);
	const usages: FeatureUsage[] = [];

	traverse(ast as any, {
		MemberExpression(path: any)
		{
			const { object, property, computed } = path.node;
			if (computed || object.type !== 'Identifier' || property.type !== 'Identifier')
			{
				return;
			}

			const ownerName = object.name;
			const memberName = property.name;
			if (declared.has(ownerName))
			{
				return;
			}

			const key = `${ownerName}.${memberName}`;
			if (index.staticApis.has(key))
			{
				const pos = nodePosition(path.node);
				usages.push({
					kind: 'static',
					label: key,
					bcdPath: ['javascript', 'builtins', ownerName, memberName],
					line: pos.line,
					column: pos.column,
				});
			}
		},

		NewExpression(path: any)
		{
			const callee = path.node.callee;
			if (!callee || callee.type !== 'Identifier')
			{
				return;
			}

			const name = callee.name;
			if (declared.has(name))
			{
				return;
			}

			if (index.constructors.has(name))
			{
				const pos = nodePosition(path.node);
				usages.push({
					kind: 'constructor',
					label: name,
					bcdPath: ['javascript', 'builtins', name],
					line: pos.line,
					column: pos.column,
				});
			}
		},

		// Syntax features (?., ??, ??=, &&=, ||=, **, ...spread) — checked
		// for every AST node via a small declarative AST-node → BCD-operator
		// bridge. Not a feature whitelist: the rules are pure shape predicates
		// that map syntactic node types to their formal BCD identifiers.
		enter(path: any)
		{
			const found = findSyntaxFeature(path.node);
			if (found)
			{
				const pos = nodePosition(path.node);
				usages.push({
					kind: 'syntax',
					label: found.label,
					bcdPath: ['javascript', 'operators', found.bcdKey],
					line: pos.line,
					column: pos.column,
				});
			}
		},

		CallExpression(path: any)
		{
			const callee = path.node.callee;

			// Global function call (`structuredClone(x)`, `queueMicrotask(...)`).
			if (callee.type === 'Identifier')
			{
				const name = callee.name;
				if (declared.has(name))
				{
					return;
				}

				if (index.globalApis.has(name))
				{
					const pos = nodePosition(path.node);
					usages.push({
						kind: 'global',
						label: name,
						bcdPath: ['api', name],
						line: pos.line,
						column: pos.column,
					});
				}

				return;
			}

			// Instance method call (`.at()`, `.replaceAll()`).
			if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier')
			{
				const methodName = callee.property.name;
				const ownerInfo = index.instanceMethods.get(methodName);
				if (!ownerInfo)
				{
					return;
				}

				const owners = ownerInfo.map(({ owner }) => `${owner}.prototype.${methodName}`);
				const ownerLabel = owners.length <= 2
					? owners.join(' / ')
					: owners[0];

				const propLoc = callee.property.loc?.start;
				usages.push({
					kind: 'instanceMethod',
					label: `.${methodName}()`,
					bcdPath: ['javascript', 'builtins', ownerInfo[0].owner, methodName],
					ownerLabel,
					ownerLabels: owners,
					line: propLoc?.line ?? 1,
					column: propLoc?.column ?? 0,
				});
			}
		},
	});

	return usages;
}
