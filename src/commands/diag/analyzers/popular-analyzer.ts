import type { PackageSnapshot } from '../package-snapshot';

export type PopularResult = {
	name: string;
	dependents: number;
};

export function analyzePopular(packages: PackageSnapshot[], limit: number): PopularResult[]
{
	const dependentCount = new Map<string, number>();

	for (const pkg of packages)
	{
		for (const dep of pkg.dependencies)
		{
			dependentCount.set(dep, (dependentCount.get(dep) || 0) + 1);
		}
	}

	return [...dependentCount.entries()]
		.map(([name, dependents]) => ({ name, dependents }))
		.sort((a, b) => b.dependents - a.dependents)
		.slice(0, limit);
}
