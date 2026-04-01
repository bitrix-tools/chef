import type { PackageSnapshot } from '../package-snapshot';

export type HeavyTotalResult = {
	name: string;
	ownJs: number;
	ownCss: number;
	ownAssets: number;
	ownTotal: number;
	js: number;
	css: number;
	assets: number;
	total: number;
	directDeps: number;
	treeDeps: number;
};

export type HeavyTotalSortKey = 'own' | 'total' | 'deps' | 'tree';

export function analyzeHeavyTotal(
	packages: PackageSnapshot[],
	limit: number,
	sortBy: HeavyTotalSortKey = 'total',
): HeavyTotalResult[]
{
	const sortKeyMap: Record<HeavyTotalSortKey, keyof HeavyTotalResult> = {
		own: 'ownTotal',
		total: 'total',
		deps: 'directDeps',
		tree: 'treeDeps',
	};

	const key = sortKeyMap[sortBy];

	return packages
		.map((pkg) => ({
			name: pkg.name,
			ownJs: pkg.bundleSize.js,
			ownCss: pkg.bundleSize.css,
			ownAssets: pkg.assetsSize,
			ownTotal: pkg.bundleSize.js + pkg.bundleSize.css + pkg.assetsSize,
			js: pkg.totalSize.js,
			css: pkg.totalSize.css,
			assets: pkg.totalSize.assets,
			total: pkg.totalSize.js + pkg.totalSize.css + pkg.totalSize.assets,
			directDeps: pkg.dependencies.length,
			treeDeps: pkg.dependencyTreeSize,
		}))
		.filter((item) => item.total > 0)
		.sort((a, b) => (b[key] as number) - (a[key] as number))
		.slice(0, limit);
}
