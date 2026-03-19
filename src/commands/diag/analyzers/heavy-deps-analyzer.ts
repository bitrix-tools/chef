import type { PackageSnapshot } from '../package-snapshot';

export type HeavyDepsResult = {
	name: string;
	count: number;
};

export function analyzeHeavyDeps(packages: PackageSnapshot[], limit: number): HeavyDepsResult[]
{
	return packages
		.map((pkg) => ({ name: pkg.name, count: pkg.dependencies.length }))
		.filter((item) => item.count > 0)
		.sort((a, b) => b.count - a.count)
		.slice(0, limit);
}
