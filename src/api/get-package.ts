import { PackageResolver } from '../modules/packages/package-resolver';

import { initializeEnvironment } from './initialize-environment';
import { Package } from './package';

import type { BaseApiOptions } from './types';

export type GetPackageOptions = BaseApiOptions;

/**
 * Resolves a single Bitrix extension by its dot-separated name (e.g. 'main.core').
 * Returns null when the extension cannot be found in the current project, or when
 * the working directory is not a Bitrix project.
 *
 * Does not throw — failures are signalled by a null return.
 */
export async function getPackage(name: string, options: GetPackageOptions = {}): Promise<Package | null>
{
	const cwd = options.cwd ?? process.cwd();

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return null;
	}

	const basePackage = PackageResolver.resolve(name);
	if (!basePackage)
	{
		return null;
	}

	return new Package(basePackage);
}
