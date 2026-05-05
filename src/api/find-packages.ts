import { ChefError } from '../diagnostics/chef-error';

import { initializeEnvironment } from './initialize-environment';
import { Package } from './package';
import { resolveTargets, validateTargetSelector, type TargetSelector } from './resolve-targets';

import type { BaseApiOptions } from './types';

export type FindPackagesOptions = BaseApiOptions & TargetSelector;

/**
 * Resolves a list of Bitrix extensions by extension names/patterns, by directory,
 * or returns every extension in the project. Returns an empty array if the
 * working directory is not a Bitrix project.
 *
 * Throws ChefError when called with both `extension` and `path` (mutually exclusive).
 */
export async function findPackages(options: FindPackagesOptions = {}): Promise<Package[]>
{
	const selectorError = validateTargetSelector(options);
	if (selectorError)
	{
		throw new ChefError(selectorError.code, selectorError.message);
	}

	const cwd = options.cwd ?? process.cwd();

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return [];
	}

	const { found } = await resolveTargets(options);
	return found.map((basePackage) => new Package(basePackage));
}
