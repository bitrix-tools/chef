import type { PackageSnapshot } from '../package-snapshot';

export type HeavyBundlesResult = {
	name: string;
	js: number;
	css: number;
	assets: number;
	total: number;
};

export type HeavyBundlesSortKey = 'js' | 'css' | 'assets' | 'total';

export function analyzeHeavyBundles(
	packages: PackageSnapshot[],
	limit: number,
	sortBy: HeavyBundlesSortKey = 'total',
): HeavyBundlesResult[]
{
	return packages
		.map((pkg) => ({
			name: pkg.name,
			js: pkg.bundleSize.js,
			css: pkg.bundleSize.css,
			assets: pkg.assetsSize,
			total: pkg.bundleSize.js + pkg.bundleSize.css + pkg.assetsSize,
		}))
		.filter((item) => item.total > 0)
		.sort((a, b) => b[sortBy] - a[sortBy])
		.slice(0, limit);
}
