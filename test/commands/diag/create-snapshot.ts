import type { PackageSnapshot } from '../../../src/commands/diag/package-snapshot';

export function createSnapshot(overrides: Partial<PackageSnapshot> & { name: string }): PackageSnapshot
{
	return {
		path: `/test/${overrides.name}`,
		namespace: '',
		exportedGlobals: new Set(),
		dependencies: [],
		dependencyTreeSize: 0,
		bundleSize: { js: 0, css: 0 },
		totalSize: { js: 0, css: 0 },
		bundleConfig: {},
		importedExtensions: new Set(),
		usedNamespaces: new Set(),
		...overrides,
	};
}
