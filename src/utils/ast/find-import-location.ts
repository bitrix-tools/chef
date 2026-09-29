import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { parseJsFile } from './parse-babel';

import type { File, Statement } from '@babel/types';
import type { BasePackage } from '../../modules/packages/base-package';

export type ImportLocation = {
	file: string;
	line: number;
	column: number;
};

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Find the first `import ... from 'partnerName'` (or `export ... from 'partnerName'`)
 * across the extension's source files. Returns absolute file path and 1-based position.
 *
 * Used to attach a meaningful code frame to inter-extension diagnostics like
 * circular dependencies — the cycle is declared in config.php, but the actionable
 * spot for the developer is usually the JS import.
 */
export async function findImportLocation(
	extension: BasePackage,
	partnerName: string,
): Promise<ImportLocation | null>
{
	const sourceFiles = extension.getSourceFiles();

	for (const file of sourceFiles)
	{
		let content: string;
		try
		{
			content = await readFile(file, 'utf-8');
		}
		catch
		{
			continue;
		}

		const ast = parseJsFile(content, file) as File | null;
		if (!ast)
		{
			continue;
		}

		for (const statement of ast.program.body)
		{
			if (getModuleSpecifier(statement) !== partnerName)
			{
				continue;
			}

			return { file, ...positionOf(statement) };
		}
	}

	return null;
}

/**
 * Find the first `import ... from './specifier'` (or `export ... from './specifier'`)
 * inside `importerFile` whose relative specifier resolves to `targetFile`.
 * Returns absolute `file` (== importerFile) and 1-based position.
 *
 * Used to attach a code frame to file-level circular-import warnings: Rollup tells us
 * the chain of resolved absolute paths, but the actionable spot is the `import` line
 * in the first file of the chain.
 */
export async function findRelativeImportLocation(
	importerFile: string,
	targetFile: string,
): Promise<ImportLocation | null>
{
	let content: string;
	try
	{
		content = await readFile(importerFile, 'utf-8');
	}
	catch
	{
		return null;
	}

	const ast = parseJsFile(content, importerFile) as File | null;
	if (!ast)
	{
		return null;
	}

	const importerDir = path.dirname(importerFile);

	for (const statement of ast.program.body)
	{
		const specifier = getModuleSpecifier(statement);
		if (!specifier || !specifier.startsWith('.'))
		{
			continue;
		}

		if (!resolvesTo(importerDir, specifier, targetFile))
		{
			continue;
		}

		return { file: importerFile, ...positionOf(statement) };
	}

	return null;
}

/**
 * Module specifier of an `import ... from '...'` or `export ... from '...'` statement.
 */
function getModuleSpecifier(statement: Statement): string | null
{
	if (statement.type === 'ImportDeclaration' || statement.type === 'ExportAllDeclaration')
	{
		return statement.source.value;
	}

	if (statement.type === 'ExportNamedDeclaration' && statement.source)
	{
		return statement.source.value;
	}

	return null;
}

/**
 * 1-based position of the statement start. Babel columns are 0-based.
 */
function positionOf(statement: Statement): { line: number; column: number }
{
	const start = statement.loc?.start;

	return {
		line: start?.line ?? 1,
		column: (start?.column ?? 0) + 1,
	};
}

function resolvesTo(importerDir: string, specifier: string, targetFile: string): boolean
{
	const base = path.resolve(importerDir, specifier);
	const target = path.resolve(targetFile);

	// Exact path with extension
	if (base === target)
	{
		return true;
	}

	// Try common extensions
	for (const ext of RESOLVE_EXTENSIONS)
	{
		if (`${base}${ext}` === target)
		{
			return true;
		}
	}

	// Try /index.* — only if such file actually exists, to keep us closer to the
	// resolver behaviour and avoid false matches.
	for (const ext of RESOLVE_EXTENSIONS)
	{
		const indexPath = path.join(base, `index${ext}`);
		if (indexPath === target && existsSync(indexPath))
		{
			return true;
		}
	}

	return false;
}
