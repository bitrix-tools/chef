import type { PackageSnapshot } from '../package-snapshot';

export type UnusedDepsResult = {
	name: string;
	unused: string[];
};

export function analyzeUnusedDeps(packages: PackageSnapshot[], limit: number): UnusedDepsResult[]
{
	const packagesByName = new Map<string, PackageSnapshot>();

	for (const pkg of packages)
	{
		packagesByName.set(pkg.name, pkg);
	}

	return packages
		.map((pkg) => {
			const unused = pkg.dependencies.filter((dep) => {
				// Direct import: import ... from 'dep' or BX.loadExtension('dep')
				if (pkg.importedExtensions.has(dep))
				{
					return false;
				}

				// Namespace usage: BX.UI.BBCode.Parser when dep exports BX.UI.BBCode.Parser
				const depPackage = packagesByName.get(dep);
				if (depPackage && depPackage.exportedGlobals.size > 0)
				{
					for (const ns of pkg.usedNamespaces)
					{
						for (const global of depPackage.exportedGlobals)
						{
							if (ns === global || ns.startsWith(global + '.'))
							{
								return false;
							}
						}
					}
				}

				return true;
			});

			return { name: pkg.name, unused };
		})
		.filter((item) => item.unused.length > 0)
		.sort((a, b) => b.unused.length - a.unused.length)
		.slice(0, limit);
}
