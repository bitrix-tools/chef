import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseJsFile } from './parse-babel';

import type {
	ExportAllDeclaration,
	ExportNamedDeclaration,
	File,
	Identifier,
	ImportDeclaration,
	Statement,
	StringLiteral,
} from '@babel/types';
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

		const ast = parseJsFile(content, file) as File | null;
		if (!ast)
		{
			continue;
		}

		const relFile = path.relative(packageRoot, file) || file;
		collectFromStatements(ast.program.body, knownExtensions, relFile, entries);
	}

	return mergeBySource(entries);
}

function collectFromStatements(
	statements: Statement[],
	knownExtensions: ReadonlySet<string>,
	relFile: string,
	out: ReExportEntry[],
): void
{
	const importsByExtension = new Map<string, Set<string>>();
	const bareExports: Array<{ names: string[]; line: number }> = [];

	for (const statement of statements)
	{
		if (statement.type === 'ImportDeclaration')
		{
			if (isTypeOnlyKind(statement.importKind))
			{
				continue;
			}

			recordImport(statement, knownExtensions, importsByExtension);
			continue;
		}

		if (statement.type === 'ExportAllDeclaration')
		{
			if (!isTypeOnlyKind(statement.exportKind))
			{
				recordDirectReExport(statement, statement.source.value, knownExtensions, relFile, out);
			}

			continue;
		}

		if (statement.type === 'ExportNamedDeclaration')
		{
			if (isTypeOnlyKind(statement.exportKind))
			{
				continue;
			}

			if (statement.source)
			{
				recordDirectReExport(statement, statement.source.value, knownExtensions, relFile, out);
			}
			else
			{
				const names = collectExportedNames(statement);
				if (names.length > 0)
				{
					bareExports.push({
						names,
						line: lineOf(statement),
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
	node: ImportDeclaration,
	knownExtensions: ReadonlySet<string>,
	importsByExtension: Map<string, Set<string>>,
): void
{
	const source = node.source.value;
	if (!isKnownExtension(source, knownExtensions))
	{
		return;
	}

	// Only named imports can be re-exported by name; default and namespace imports are skipped.
	const namedSpecifiers = node.specifiers.filter((specifier) => specifier.type === 'ImportSpecifier');
	if (namedSpecifiers.length === 0)
	{
		return;
	}

	const bucket = importsByExtension.get(source) ?? new Set<string>();
	for (const specifier of namedSpecifiers)
	{
		if (isTypeOnlyKind(specifier.importKind))
		{
			continue;
		}

		bucket.add(specifier.local.name);
	}
	importsByExtension.set(source, bucket);
}

function recordDirectReExport(
	node: ExportNamedDeclaration | ExportAllDeclaration,
	source: string,
	knownExtensions: ReadonlySet<string>,
	relFile: string,
	out: ReExportEntry[],
): void
{
	if (!isKnownExtension(source, knownExtensions))
	{
		return;
	}

	const line = lineOf(node);

	if (node.type === 'ExportAllDeclaration')
	{
		out.push({ source, symbols: ['*'], wildcard: true, file: relFile, line });

		return;
	}

	const namespaceSpecifier = node.specifiers.find((specifier) => specifier.type === 'ExportNamespaceSpecifier');
	if (namespaceSpecifier)
	{
		out.push({
			source,
			symbols: [`* as ${nameOf(namespaceSpecifier.exported)}`],
			wildcard: true,
			file: relFile,
			line,
		});

		return;
	}

	const symbols = collectExportedNames(node);
	if (symbols.length > 0)
	{
		out.push({ source, symbols, wildcard: false, file: relFile, line });
	}
}

function collectExportedNames(node: ExportNamedDeclaration): string[]
{
	const names: string[] = [];

	for (const specifier of node.specifiers)
	{
		if (specifier.type === 'ExportSpecifier' && !isTypeOnlyKind(specifier.exportKind))
		{
			names.push(nameOf(specifier.exported));
		}
	}

	return names;
}

function isTypeOnlyKind(kind: string | null | undefined): boolean
{
	return kind === 'type' || kind === 'typeof';
}

function nameOf(node: Identifier | StringLiteral): string
{
	return node.type === 'Identifier' ? node.name : node.value;
}

function isKnownExtension(source: string, knownExtensions: ReadonlySet<string>): boolean
{
	if (!EXTENSION_NAME_PATTERN.test(source))
	{
		return false;
	}

	return knownExtensions.has(source);
}

function lineOf(node: Statement): number
{
	return node.loc?.start.line ?? 1;
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
