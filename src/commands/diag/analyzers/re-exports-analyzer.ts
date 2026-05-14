import { findReExports } from '../../../utils/ast/find-re-exports';

import type { ReExportEntry } from '../../../utils/ast/find-re-exports';
import type { PackageSnapshot } from '../package-snapshot';
import type { BasePackage } from '../../../modules/packages/base-package';

export type { ReExportEntry } from '../../../utils/ast/find-re-exports';

export type ReExportResult = {
	name: string;
	namespace: string;
	entries: ReExportEntry[];
	sameNamespaceCount: number;
};

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
	const knownExtensions = new Set(namespaceByName.keys());

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

		const entries = await findReExports(extension, knownExtensions);
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
