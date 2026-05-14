import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { parseSource } from './parse-source';

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
	const { default: ts } = await import('typescript');
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

		const sourceFile = await parseSource(file, content);
		if (!sourceFile)
		{
			continue;
		}

		for (const statement of sourceFile.statements)
		{
			const moduleSpecifier = (() => {
				if (ts.isImportDeclaration(statement))
				{
					return statement.moduleSpecifier;
				}
				if (ts.isExportDeclaration(statement) && statement.moduleSpecifier)
				{
					return statement.moduleSpecifier;
				}

				return null;
			})();

			if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier))
			{
				continue;
			}

			if (moduleSpecifier.text !== partnerName)
			{
				continue;
			}

			const pos = statement.getStart(sourceFile);
			const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);

			return { file, line: line + 1, column: character + 1 };
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
	const { default: ts } = await import('typescript');

	let content: string;
	try
	{
		content = await readFile(importerFile, 'utf-8');
	}
	catch
	{
		return null;
	}

	const sourceFile = await parseSource(importerFile, content);
	if (!sourceFile)
	{
		return null;
	}

	const importerDir = path.dirname(importerFile);

	for (const statement of sourceFile.statements)
	{
		const moduleSpecifier = (() => {
			if (ts.isImportDeclaration(statement))
			{
				return statement.moduleSpecifier;
			}
			if (ts.isExportDeclaration(statement) && statement.moduleSpecifier)
			{
				return statement.moduleSpecifier;
			}

			return null;
		})();

		if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier))
		{
			continue;
		}

		const specifier = moduleSpecifier.text;
		if (!specifier.startsWith('.'))
		{
			continue;
		}

		if (!resolvesTo(importerDir, specifier, targetFile))
		{
			continue;
		}

		const pos = statement.getStart(sourceFile);
		const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);

		return { file: importerFile, line: line + 1, column: character + 1 };
	}

	return null;
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
