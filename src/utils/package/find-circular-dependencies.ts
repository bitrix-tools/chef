import { PackageResolver } from '../../modules/packages/package-resolver';

import type { BasePackage } from '../../modules/packages/base-package';

export type CircularDependency = string[];

/**
 * Finds direct circular dependencies (A → B → A).
 * For each dependency of the target, checks if that dependency
 * also depends back on the target.
 */
export async function findCircularDependencies(
	options: { target: BasePackage }
): Promise<CircularDependency[]>
{
	const { target } = options;
	const name = target.getName();
	const cycles: CircularDependency[] = [];

	const dependencies = await target.getDependencies();

	for (const dep of dependencies)
	{
		// Self-dependency
		if (dep.name === name)
		{
			cycles.push([name, name]);
			continue;
		}

		const depExtension = PackageResolver.resolve(dep.name);
		if (!depExtension)
		{
			continue;
		}

		const depDependencies = await depExtension.getDependencies();
		const dependsBack = depDependencies.some((d) => d.name === name);

		if (dependsBack)
		{
			cycles.push([name, dep.name, name]);
		}
	}

	return cycles;
}
