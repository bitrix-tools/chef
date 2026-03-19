import type { PackageSnapshot } from '../package-snapshot';

export type HeavyBundlesResult = {
	name: string;
	js: number;
	css: number;
	total: number;
};

export function analyzeHeavyBundles(packages: PackageSnapshot[], limit: number): HeavyBundlesResult[]
{
	return packages
		.map((pkg) => ({
			name: pkg.name,
			js: pkg.bundleSize.js,
			css: pkg.bundleSize.css,
			total: pkg.bundleSize.js + pkg.bundleSize.css,
		}))
		.filter((item) => item.total > 0)
		.sort((a, b) => b.total - a.total)
		.slice(0, limit);
}
