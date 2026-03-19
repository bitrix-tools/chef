import type { PackageSnapshot } from '../package-snapshot';

export type DeepDepsResult = {
	name: string;
	treeSize: number;
};

export function analyzeDeepDeps(packages: PackageSnapshot[], limit: number): DeepDepsResult[]
{
	return packages
		.map((pkg) => ({ name: pkg.name, treeSize: pkg.dependencyTreeSize }))
		.filter((item) => item.treeSize > 0)
		.sort((a, b) => b.treeSize - a.treeSize)
		.slice(0, limit);
}
