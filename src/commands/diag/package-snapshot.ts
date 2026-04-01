import * as path from 'node:path';
import { existsSync, statSync } from 'node:fs';

import { stripComments } from './analyzers/file-scanner';

import type { BasePackage } from '../../modules/packages/base-package';

export type PackageSnapshot = {
	name: string;
	path: string;
	namespace: string;
	exportedGlobals: Set<string>;
	dependencies: string[];
	dependencyTreeSize: number;
	bundleSize: { js: number; css: number };
	assetsSize: number;
	totalSize: { js: number; css: number; assets: number };
	bundleConfig: Record<string, unknown>;
	importedExtensions: Set<string>;
	usedNamespaces: Set<string>;
};

export type SnapshotField = keyof Omit<PackageSnapshot, 'name' | 'path' | 'namespace'>;

export async function createSnapshot(
	extension: BasePackage,
	fields: Set<SnapshotField>,
): Promise<PackageSnapshot>
{
	const snapshot: PackageSnapshot = {
		name: extension.getName(),
		path: extension.getPath(),
		namespace: extension.getBundleConfig().get('namespace') ?? '',
		exportedGlobals: new Set(),
		dependencies: [],
		dependencyTreeSize: 0,
		bundleSize: { js: 0, css: 0 },
		assetsSize: 0,
		totalSize: { js: 0, css: 0, assets: 0 },
		bundleConfig: {},
		importedExtensions: new Set(),
		usedNamespaces: new Set(),
	};

	if (fields.has('dependencies') || fields.has('importedExtensions'))
	{
		const deps = await extension.getDependencies();
		snapshot.dependencies = deps.map((d) => d.name);
	}

	if (fields.has('dependencyTreeSize'))
	{
		const tree = await extension.getFlattedDependenciesTree(true);
		snapshot.dependencyTreeSize = tree.length;
	}

	if (fields.has('bundleSize') || fields.has('assetsSize'))
	{
		snapshot.bundleSize = extension.getBundlesSize();
	}

	if (fields.has('assetsSize'))
	{
		snapshot.assetsSize = extension.getAssetsSize();
	}

	if (fields.has('totalSize'))
	{
		snapshot.totalSize = await extension.getTotalTransferredSize();
	}

	if (fields.has('bundleConfig'))
	{
		const rawConfig = extension.getBundleConfig().getRawConfig();

		for (const [key, value] of Object.entries(rawConfig))
		{
			if (value !== undefined)
			{
				snapshot.bundleConfig[key] = value;
			}
		}
	}

	if (fields.has('exportedGlobals') || fields.has('importedExtensions'))
	{
		snapshot.exportedGlobals = await findExportedGlobals(extension);
	}

	if (fields.has('importedExtensions'))
	{
		const { imported, namespaces } = await findUsedExtensions(extension);
		snapshot.importedExtensions = imported;
		snapshot.usedNamespaces = namespaces;
	}

	return snapshot;
}

export async function findExportedGlobals(extension: BasePackage): Promise<Set<string>>
{
	const namespace = extension.getBundleConfig().get('namespace') ?? '';
	if (!namespace)
	{
		return new Set();
	}

	const { readFile } = await import('node:fs/promises');
	const entryPoint = extension.getInputPath();
	const exportNames = new Set<string>();
	const visited = new Set<string>();

	async function collectExports(filePath: string): Promise<void>
	{
		const resolved = resolveFilePath(filePath);
		if (!resolved || visited.has(resolved))
		{
			return;
		}

		visited.add(resolved);

		let content: string;
		try
		{
			content = await readFile(resolved, 'utf-8');
		}
		catch
		{
			return;
		}

		// export class ClassName / export function funcName / export const varName
		const directPattern = /export\s+(?:class|function|const|let|var)\s+([A-Z][A-Za-z0-9_]*)/g;
		for (const match of content.matchAll(directPattern))
		{
			exportNames.add(match[1]);
		}

		// export { Name1, Name2 as Alias }
		const namedPattern = /export\s*\{([^}]+)\}/g;
		for (const match of content.matchAll(namedPattern))
		{
			const names = match[1].split(',');
			for (const name of names)
			{
				const trimmed = name.trim();
				// "Name as Alias" → take Alias; "Name" → take Name
				const asMatch = trimmed.match(/\w+\s+as\s+(\w+)/);
				const exportName = asMatch ? asMatch[1] : trimmed.split(/\s/)[0];
				if (exportName && /^[A-Z]/.test(exportName))
				{
					exportNames.add(exportName);
				}
			}
		}

		// export * from './local-file' — follow re-exports from local files only
		const reExportPattern = /export\s*\*\s*from\s*['"](\.[^'"]+)['"]/g;
		for (const match of content.matchAll(reExportPattern))
		{
			const reExportPath = path.resolve(path.dirname(resolved), match[1]);
			await collectExports(reExportPath);
		}
	}

	await collectExports(entryPoint);

	const globals = new Set<string>();
	for (const name of exportNames)
	{
		globals.add(`${namespace}.${name}`);
	}

	return globals;
}

function resolveFilePath(filePath: string): string | null
{
	if (existsSync(filePath) && statSync(filePath).isFile())
	{
		return filePath;
	}

	// Try common extensions
	for (const ext of ['.ts', '.js', '.tsx', '.jsx'])
	{
		const withExt = filePath + ext;
		if (existsSync(withExt))
		{
			return withExt;
		}
	}

	// Try index files
	for (const ext of ['.ts', '.js'])
	{
		const indexPath = path.join(filePath, `index${ext}`);
		if (existsSync(indexPath))
		{
			return indexPath;
		}
	}

	return null;
}

type UsedExtensionsResult = {
	imported: Set<string>;
	namespaces: Set<string>;
};

async function findUsedExtensions(extension: BasePackage): Promise<UsedExtensionsResult>
{
	const { readFile } = await import('node:fs/promises');
	const imported = new Set<string>();
	const namespaces = new Set<string>();
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

		// Strip comments to avoid false positives
		const code = stripComments(content);

		// import ... from 'extension.name' or import 'extension.name' (side-effect)
		const importPattern = /(?:from\s+|import\s+)['"]([a-z][a-z0-9._-]+)['"]/g;
		for (const match of code.matchAll(importPattern))
		{
			imported.add(match[1]);
		}

		// Note: BX.loadExtension / Runtime.loadExtension are NOT counted as usage.
		// They load extensions dynamically at runtime without declaring a dependency in config.php.

		// Reflection.getClass('BX.Namespace.Class') / Runtime.getClass('BX.Namespace.Class')
		const getClassPattern = /(?:Reflection|Runtime)\.getClass\(\s*['"]([A-Za-z0-9.]+)['"]\s*\)/g;
		for (const match of code.matchAll(getClassPattern))
		{
			namespaces.add(match[1]);
		}

		// BX.Namespace.Something — namespace usage
		const namespacePattern = /BX\.[A-Z][A-Za-z0-9]+(?:\.[A-Z][A-Za-z0-9]+)*/g;
		for (const match of code.matchAll(namespacePattern))
		{
			namespaces.add(match[0]);
		}
	}

	return { imported, namespaces };
}
