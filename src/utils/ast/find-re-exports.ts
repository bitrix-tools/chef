import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseSource } from './parse-source';

import type {
	SourceFile,
	ExportDeclaration,
	ImportDeclaration,
} from 'typescript';
import type { BasePackage } from '../../modules/packages/base-package';

export type ReExportEntry = {
	source: string;
	symbols: string[];
	wildcard: boolean;
	file: string;
	line: number;
};

const EXTENSION_NAME_PATTERN = /^[a-z][a-z0-9._-]+$/;

/**
 * Walks every source file of `extension` and collects ESM re-exports whose source module
 * is another known extension (presence is checked via `knownExtensions`). Type-only forms
 * (`import type`, `export type`, inline `{ type Foo }`) are skipped — they are erased by
 * transpilation and do not create runtime bindings.
 */
export async function findReExports(
	extension: BasePackage,
	knownExtensions: ReadonlySet<string>,
): Promise<ReExportEntry[]>
{
	const { default: ts } = await import('typescript');

	const entries: ReExportEntry[] = [];
	const sourceFiles = extension.getSourceFiles();
	const packageRoot = extension.getPath();

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

		const relFile = path.relative(packageRoot, file) || file;
		collectFromSourceFile(ts, sourceFile, knownExtensions, relFile, entries);
	}

	return mergeBySource(entries);
}

function collectFromSourceFile(
	ts: typeof import('typescript'),
	sourceFile: SourceFile,
	knownExtensions: ReadonlySet<string>,
	relFile: string,
	out: ReExportEntry[],
): void
{
	const importsByExtension = new Map<string, Set<string>>();
	const bareExports: Array<{ names: string[]; line: number }> = [];

	for (const statement of sourceFile.statements)
	{
		if (ts.isImportDeclaration(statement))
		{
			if (statement.importClause?.isTypeOnly)
			{
				continue;
			}

			recordImport(ts, statement, knownExtensions, importsByExtension);
			continue;
		}

		if (ts.isExportDeclaration(statement))
		{
			if (statement.isTypeOnly)
			{
				continue;
			}

			const moduleSpecifier = statement.moduleSpecifier;
			if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier))
			{
				recordDirectReExport(ts, statement, moduleSpecifier.text, knownExtensions, sourceFile, relFile, out);
			}
			else if (statement.exportClause && ts.isNamedExports(statement.exportClause))
			{
				const names = statement.exportClause.elements
					.filter((el) => !el.isTypeOnly)
					.map((el) => el.name.text);
				if (names.length > 0)
				{
					bareExports.push({
						names,
						line: lineOfPos(sourceFile, statement.getStart(sourceFile)),
					});
				}
			}
		}
	}

	if (importsByExtension.size === 0 || bareExports.length === 0)
	{
		return;
	}

	for (const bare of bareExports)
	{
		for (const [source, importedNames] of importsByExtension)
		{
			const overlap = bare.names.filter((name) => importedNames.has(name));
			if (overlap.length === 0)
			{
				continue;
			}

			out.push({
				source,
				symbols: overlap,
				wildcard: false,
				file: relFile,
				line: bare.line,
			});
		}
	}
}

function recordImport(
	ts: typeof import('typescript'),
	node: ImportDeclaration,
	knownExtensions: ReadonlySet<string>,
	importsByExtension: Map<string, Set<string>>,
): void
{
	const moduleSpecifier = node.moduleSpecifier;
	if (!ts.isStringLiteral(moduleSpecifier))
	{
		return;
	}

	const source = moduleSpecifier.text;
	if (!isKnownExtension(source, knownExtensions))
	{
		return;
	}

	const importClause = node.importClause;
	if (!importClause || !importClause.namedBindings)
	{
		return;
	}

	if (!ts.isNamedImports(importClause.namedBindings))
	{
		return;
	}

	const bucket = importsByExtension.get(source) ?? new Set<string>();
	for (const element of importClause.namedBindings.elements)
	{
		if (element.isTypeOnly)
		{
			continue;
		}

		bucket.add(element.name.text);
	}
	importsByExtension.set(source, bucket);
}

function recordDirectReExport(
	ts: typeof import('typescript'),
	node: ExportDeclaration,
	source: string,
	knownExtensions: ReadonlySet<string>,
	sourceFile: SourceFile,
	relFile: string,
	out: ReExportEntry[],
): void
{
	if (!isKnownExtension(source, knownExtensions))
	{
		return;
	}

	const line = lineOfPos(sourceFile, node.getStart(sourceFile));

	if (!node.exportClause)
	{
		out.push({ source, symbols: ['*'], wildcard: true, file: relFile, line });

		return;
	}

	if (ts.isNamespaceExport(node.exportClause))
	{
		out.push({
			source,
			symbols: [`* as ${node.exportClause.name.text}`],
			wildcard: true,
			file: relFile,
			line,
		});

		return;
	}

	if (ts.isNamedExports(node.exportClause))
	{
		const symbols = node.exportClause.elements
			.filter((el) => !el.isTypeOnly)
			.map((el) => el.name.text);
		if (symbols.length > 0)
		{
			out.push({ source, symbols, wildcard: false, file: relFile, line });
		}
	}
}

function isKnownExtension(source: string, knownExtensions: ReadonlySet<string>): boolean
{
	if (!EXTENSION_NAME_PATTERN.test(source))
	{
		return false;
	}

	return knownExtensions.has(source);
}

function lineOfPos(sourceFile: SourceFile, pos: number): number
{
	return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function mergeBySource(entries: ReExportEntry[]): ReExportEntry[]
{
	const byKey = new Map<string, ReExportEntry>();

	for (const entry of entries)
	{
		const key = `${entry.source}::${entry.file}`;
		const existing = byKey.get(key);
		if (!existing)
		{
			byKey.set(key, { ...entry, symbols: [...entry.symbols] });
			continue;
		}

		for (const sym of entry.symbols)
		{
			if (!existing.symbols.includes(sym))
			{
				existing.symbols.push(sym);
			}
		}

		if (entry.wildcard)
		{
			existing.wildcard = true;
		}
	}

	return [...byKey.values()];
}
