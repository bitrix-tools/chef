import { PackageResolver } from '../../modules/packages/package.resolver';
import type { BasePackage } from '../../modules/packages/base-package';

export type CircularDependency = string[];

type FindCircularDependenciesOptions = {
	target: BasePackage;
	rootName?: string;
	visited?: Set<string>;
	cycles?: CircularDependency[];
};

/**
 * Finds circular dependencies where the target package is part of the cycle.
 * Only reports cycles that include the root package (direct circular dependency).
 */
export async function findCircularDependencies(
	options: FindCircularDependenciesOptions
): Promise<CircularDependency[]>
{
	const { target, visited = new Set<string>(), cycles = [] } = options;
	const name = target.getName();
	const rootName = options.rootName ?? name;

	if (visited.has(name))
	{
		return cycles;
	}

	visited.add(name);

	const dependencies = await target.getDependencies();

	for (const dep of dependencies)
	{
		// Direct cycle back to root package
		if (dep.name === rootName)
		{
			cycles.push([name, rootName]);
			continue;
		}

		const extension = PackageResolver.resolve(dep.name);
		if (extension)
		{
			await findCircularDependencies({
				target: extension,
				rootName,
				visited,
				cycles,
			});
		}
	}

	return cycles;
}