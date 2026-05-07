import type { PackageSnapshot } from '../package-snapshot';

export type HeavyDepsResult = {
	name: string;
	directDeps: number;
};

export function analyzeHeavyDeps(packages: PackageSnapshot[], limit: number): HeavyDepsResult[]
{
	return packages
		.map((pkg) => ({ name: pkg.name, directDeps: pkg.dependencies.length }))
		.filter((item) => item.directDeps > 0)
		.sort((a, b) => b.directDeps - a.directDeps)
		.slice(0, limit);
}
