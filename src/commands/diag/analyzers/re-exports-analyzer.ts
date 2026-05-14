import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseSource } from '../../../utils/ast/parse-source';

import type {
	SourceFile,
	ExportDeclaration,
	ImportDeclaration,
} from 'typescript';
import type { PackageSnapshot } from '../package-snapshot';
import type { BasePackage } from '../../../modules/packages/base-package';

export type ReExportEntry = {
	source: string;
	symbols: string[];
	wildcard: boolean;
	file: string;
	line: number;
};

export type ReExportResult = {
	name: string;
	namespace: string;
	entries: ReExportEntry[];
	sameNamespaceCount: number;
};

const EXTENSION_NAME_PATTERN = /^[a-z][a-z0-9._-]+$/;

export async function analyzeReExports(
	packages: PackageSnapshot[],
	getPackage: (name: string) => BasePackage | null,
	onProgress?: (current: number, total: number, name: string) => void,
): Promise<ReExportResult[]>
{
	const namespaceByName = new Map<string, string>();
	for (const pkg of packages)
	{
		namespaceByName.set(pkg.name, pkg.namespace ?? '');
	}

	const results: ReExportResult[] = [];
	const total = packages.length;
	let index = 0;

	for (const pkg of packages)
	{
		index++;
		onProgress?.(index, total, pkg.name);

		const extension = getPackage(pkg.name);
		if (!extension)
		{
			continue;
		}

		const entries = await collectReExports(extension, namespaceByName);
		if (entries.length === 0)
		{
			continue;
		}

		const ownNamespace = pkg.namespace ?? '';
		const sameNamespaceCount = entries.filter((entry) => {
			const sourceNamespace = namespaceByName.get(entry.source) ?? '';

			return Boolean(ownNamespace) && sourceNamespace === ownNamespace;
		}).length;

		results.push({
			name: pkg.name,
			namespace: ownNamespace,
			entries,
			sameNamespaceCount,
		});
	}

	results.sort((a, b) => {
		if (a.sameNamespaceCount !== b.sameNamespaceCount)
		{
			return b.sameNamespaceCount - a.sameNamespaceCount;
		}

		if (a.entries.length !== b.entries.length)
		{
			return b.entries.length - a.entries.length;
		}

		return a.name.localeCompare(b.name);
	});

	return results;
}

async function collectReExports(
	extension: BasePackage,
	namespaceByName: Map<string, string>,
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
		collectFromSourceFile(ts, sourceFile, namespaceByName, relFile, entries);
	}

	return mergeBySource(entries);
}

function collectFromSourceFile(
	ts: typeof import('typescript'),
	sourceFile: SourceFile,
	namespaceByName: Map<string, string>,
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
			// `import type { … }` is erased by transpilation — no runtime binding, no live getter.
			if (statement.importClause?.isTypeOnly)
			{
				continue;
			}

			recordImport(ts, statement, namespaceByName, importsByExtension);
			continue;
		}

		if (ts.isExportDeclaration(statement))
		{
			// `export type { … }` is erased by transpilation — same reasoning as import type.
			if (statement.isTypeOnly)
			{
				continue;
			}

			const moduleSpecifier = statement.moduleSpecifier;
			if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier))
			{
				recordDirectReExport(ts, statement, moduleSpecifier.text, namespaceByName, sourceFile, relFile, out);
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
	namespaceByName: Map<string, string>,
	importsByExtension: Map<string, Set<string>>,
): void
{
	const moduleSpecifier = node.moduleSpecifier;
	if (!ts.isStringLiteral(moduleSpecifier))
	{
		return;
	}

	const source = moduleSpecifier.text;
	if (!isKnownExtension(source, namespaceByName))
	{
		return;
	}

	const importClause = node.importClause;
	if (!importClause || !importClause.namedBindings)
	{
		return;
	}

	// `import * as Ns from 'ext'` (NamespaceImport) — single binding, not a per-symbol re-export
	// candidate in the way we detect. Skip.
	if (!ts.isNamedImports(importClause.namedBindings))
	{
		return;
	}

	const bucket = importsByExtension.get(source) ?? new Set<string>();
	for (const element of importClause.namedBindings.elements)
	{
		// Individual `{ type Foo }` specifiers are erased by transpilation.
		if (element.isTypeOnly)
		{
			continue;
		}

		// element.name is the LOCAL name (after `as`) — that's what matters for matching `export { … }`
		bucket.add(element.name.text);
	}
	importsByExtension.set(source, bucket);
}

function recordDirectReExport(
	ts: typeof import('typescript'),
	node: ExportDeclaration,
	source: string,
	namespaceByName: Map<string, string>,
	sourceFile: SourceFile,
	relFile: string,
	out: ReExportEntry[],
): void
{
	if (!isKnownExtension(source, namespaceByName))
	{
		return;
	}

	const line = lineOfPos(sourceFile, node.getStart(sourceFile));

	// export * from 'ext'
	if (!node.exportClause)
	{
		out.push({
			source,
			symbols: ['*'],
			wildcard: true,
			file: relFile,
			line,
		});

		return;
	}

	// export * as Foo from 'ext'
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
			out.push({
				source,
				symbols,
				wildcard: false,
				file: relFile,
				line,
			});
		}
	}
}

function isKnownExtension(source: string, namespaceByName: Map<string, string>): boolean
{
	if (!EXTENSION_NAME_PATTERN.test(source))
	{
		return false;
	}

	return namespaceByName.has(source);
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
