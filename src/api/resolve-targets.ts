import { PackageResolver } from '../modules/packages/package-resolver';
import { PackageFactoryProvider } from '../modules/packages/providers/package-factory-provider';
import { findPackages as findPackagesStream } from '../utils/package/find-packages';
import { Environment } from '../environment/environment';
import { CF } from '../diagnostics/diagnostic-codes';

import type { BasePackage } from '../modules/packages/base-package';
import type { ChefErrorPayload, ChefNotFoundEntry } from './types';

export type TargetSelector = {
	/**
	 * Extension name(s) or glob pattern(s):
	 * 'main.core', ['main.core', 'ui.buttons'], 'ui.bbcode.*'.
	 * Mutually exclusive with `path`.
	 */
	extension?: string | string[],

	/**
	 * Directory to scan for extensions. Absolute, or relative to cwd.
	 * Mutually exclusive with `extension`.
	 */
	path?: string,
};

export type ResolveTargetsResult = {
	found: BasePackage[],
	notFound: ChefNotFoundEntry[],
	error?: ChefErrorPayload,
};

/**
 * Validates a TargetSelector. Returns a ChefErrorPayload if `extension` and
 * `path` are both provided (these are mutually exclusive), otherwise null.
 */
export function validateTargetSelector(selector: TargetSelector): ChefErrorPayload | null
{
	if (selector.extension !== undefined && selector.path !== undefined)
	{
		return {
			code: CF.OPTION_DENIED,
			message: '`extension` and `path` are mutually exclusive — extensions resolve from the project root, `path` scans a directory',
		};
	}

	return null;
}

/**
 * Resolves a TargetSelector into the list of BasePackage instances to operate
 * on. Returns either {extension} resolved by name/pattern, or extensions found
 * under {path}, or every extension under the project root when neither is set.
 *
 * Returns an `error` payload if the selector is invalid (does not throw).
 */
export async function resolveTargets(selector: TargetSelector): Promise<ResolveTargetsResult>
{
	const error = validateTargetSelector(selector);
	if (error)
	{
		return { found: [], notFound: [], error };
	}

	const { extension, path } = selector;

	if (extension !== undefined)
	{
		const extensionList = Array.isArray(extension) ? extension : [extension];
		const { found, notFound } = await PackageResolver.resolveAll(extensionList);
		return { found, notFound };
	}

	const startDirectory = path ?? Environment.getRoot() ?? process.cwd();
	const found: BasePackage[] = [];

	await new Promise<void>((resolve, reject) => {
		const stream = findPackagesStream({
			startDirectory,
			packageFactory: PackageFactoryProvider.create(),
		});
		stream
			.on('data', ({ extension: basePackage }: { extension: BasePackage }) => {
				found.push(basePackage);
			})
			.on('done', () => resolve())
			.on('error', (streamError: Error) => reject(streamError));
	});

	return { found, notFound: [] };
}
