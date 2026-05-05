import { CF } from '../diagnostics/diagnostic-codes';

import { initializeEnvironment } from './initialize-environment';
import { toErrorPayload } from './to-error-payload';
import { resolveTargets, type TargetSelector } from './resolve-targets';

import type { BaseApiOptions, ChefDataResult, ChefNotFoundEntry } from './types';

export type ResolveOptions = BaseApiOptions & TargetSelector;

export type ResolvedExtension = {
	name: string,
	path: string,
};

export type ResolveData = {
	found: ResolvedExtension[],
	notFound: ChefNotFoundEntry[],
};

export type ResolveApiResult = ChefDataResult<ResolveData>;

export async function resolve(options: ResolveOptions = {}): Promise<ResolveApiResult>
{
	const startedAt = Date.now();
	const cwd = options.cwd ?? process.cwd();
	const command = 'resolve';

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return {
			ok: false,
			command,
			error: envError,
			durationMs: Date.now() - startedAt,
		};
	}

	try
	{
		const { found, notFound, error } = await resolveTargets(options);
		if (error)
		{
			return {
				ok: false,
				command,
				error,
				durationMs: Date.now() - startedAt,
			};
		}

		return {
			ok: notFound.length === 0,
			command,
			data: {
				found: found.map((extensionPackage) => ({
					name: extensionPackage.getName(),
					path: extensionPackage.getPath(),
				})),
				notFound,
			},
			durationMs: Date.now() - startedAt,
		};
	}
	catch (error)
	{
		return {
			ok: false,
			command,
			error: toErrorPayload(error, CF.PACKAGE_READ_ERROR),
			durationMs: Date.now() - startedAt,
		};
	}
}
