import type { PackageSnapshot } from '../package-snapshot';

export type HeavyTotalResult = {
	name: string;
	ownJs: number;
	ownCss: number;
	ownTotal: number;
	js: number;
	css: number;
	total: number;
	directDeps: number;
	treeDeps: number;
};

export function analyzeHeavyTotal(packages: PackageSnapshot[], limit: number): HeavyTotalResult[]
{
	return packages
		.map((pkg) => ({
			name: pkg.name,
			ownJs: pkg.bundleSize.js,
			ownCss: pkg.bundleSize.css,
			ownTotal: pkg.bundleSize.js + pkg.bundleSize.css,
			js: pkg.totalSize.js,
			css: pkg.totalSize.css,
			total: pkg.totalSize.js + pkg.totalSize.css,
			directDeps: pkg.dependencies.length,
			treeDeps: pkg.dependencyTreeSize,
		}))
		.filter((item) => item.total > 0)
		.sort((a, b) => b.total - a.total)
		.slice(0, limit);
}
