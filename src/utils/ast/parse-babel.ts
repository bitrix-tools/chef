import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

import type { Node as BabelNode } from '@babel/types';

// @babel/traverse is CommonJS; under ESM it exposes the function on `.default`,
// while under CJS the import already IS the function. Normalize both.
export const traverse: typeof _traverse = (_traverse as any).default ?? _traverse;

/**
 * Traverse without building Babel's lexical scope. Use when the visitor only
 * inspects node shapes (no `path.scope` access) — skipping scope analysis is
 * faster and tolerates legacy code that re-declares the same binding multiple
 * times in one scope (Bitrix sources do this in non-strict files; the strict
 * Babel scope checker throws `Duplicate declaration "name"` otherwise).
 */
export function traverseShallow(ast: BabelNode, visitor: Parameters<typeof _traverse>[1]): void
{
	traverse(ast as any, { noScope: true, ...(visitor as any) });
}

export type NodePosition = {
	line: number;
	column: number;
};

export function nodePosition(node: BabelNode): NodePosition
{
	const loc = node.loc?.start;

	return {
		line: loc?.line ?? 1,
		// Babel columns are 0-based.
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

/**
 * Parse JS/TS source with Babel, auto-selecting plugin combinations based on
 * file extension. Returns null if the source cannot be parsed.
 *
 * - .ts/.mts/.cts → TypeScript
 * - .tsx          → TypeScript + JSX
 * - .jsx          → JS + JSX
 * - .js/.mjs/.cjs → JS + JSX, with Flow + JSX as fallback (some legacy
 *                   Bitrix extensions still use Flow type annotations in .js)
 */
export function parseJsFile(code: string, filePath: string): BabelNode | null
{
	const isTypeScript = /\.(ts|mts|cts|tsx)$/.test(filePath);
	const isJsx = /\.(jsx|tsx)$/.test(filePath);

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
	const jsxResult = tryParse(code, [...baseCommon, 'jsx']);
	if (jsxResult !== null)
	{
		return jsxResult;
	}

	return tryParse(code, [...baseCommon, 'flow', 'jsx']);
}
