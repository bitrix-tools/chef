import { CF } from '../diagnostics/diagnostic-codes';

import { initializeEnvironment } from './initialize-environment';
import { toErrorPayload } from './to-error-payload';
import { resolveTargets, type TargetSelector } from './resolve-targets';

import type { BuildResult as EngineBuildResult, BundleFileInfo } from '../modules/engines/build/build-types';
import type { BasePackage } from '../modules/packages/base-package';
import type { BaseApiOptions, ChefErrorPayload, ChefExtensionResult, ChefResult } from './types';

export type BuildSingleOptions = {
	force?: boolean,
};

export type BuildOptions = BaseApiOptions & TargetSelector & BuildSingleOptions;

export type BuildDetails = {
	bundles: BundleFileInfo[],
	dependencies: string[],
	standalone: boolean,
};

export type BuildExtensionResult = ChefExtensionResult<BuildDetails>;

export type BuildSummaryExtras = {
	bundlesSize: number,    // total size of all output bundles, in bytes
	warningCount: number,
};

export type BuildApiResult = ChefResult<BuildDetails, BuildSummaryExtras>;

export async function build(options: BuildOptions = {}): Promise<BuildApiResult>
{
	const startedAt = Date.now();
	const cwd = options.cwd ?? process.cwd();
	const command = 'build';

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return emptyResult(command, startedAt, envError);
	}

	const extensions: BuildExtensionResult[] = [];
	let resolvedNotFound: BuildApiResult['notFound'] = [];

	try
	{
		const { found, notFound, error } = await resolveTargets(options);
		if (error)
		{
			return emptyResult(command, startedAt, error);
		}

		resolvedNotFound = notFound;

		for (const extensionPackage of found)
		{
			extensions.push(await buildSinglePackage(extensionPackage, options));
		}
	}
	catch (error)
	{
		return emptyResult(command, startedAt, toErrorPayload(error, CF.PACKAGE_READ_ERROR));
	}

	const passed = extensions.filter((extension) => extension.ok).length;
	const failed = extensions.length - passed;

	const { bundlesSize, warningCount } = extensions.reduce(
		(acc, extension) => {
			acc.warningCount += extension.warnings?.length ?? 0;
			for (const bundle of extension.details?.bundles ?? [])
			{
				acc.bundlesSize += bundle.size;
			}
			return acc;
		},
		{ bundlesSize: 0, warningCount: 0 },
	);

	return {
		ok: passed === extensions.length && resolvedNotFound.length === 0,
		command,
		extensions,
		notFound: resolvedNotFound,
		summary: {
			total: extensions.length,
			passed,
			failed,
			durationMs: Date.now() - startedAt,
			bundlesSize,
			warningCount,
		},
	};
}

export async function buildSinglePackage(
	extensionPackage: BasePackage,
	options: BuildSingleOptions = {},
): Promise<BuildExtensionResult>
{
	const taskStart = Date.now();
	const name = extensionPackage.getName();
	const path = extensionPackage.getPath();

	try
	{
		const buildResult: EngineBuildResult = await extensionPackage.build({ force: options.force });
		const ok = buildResult.errors.length === 0;

		const warnings = buildResult.warnings.map((warning) => ({
			code: warning.code ?? CF.UNKNOWN_BUILD_WARNING,
			message: warning.message,
			file: warning.loc?.file,
			line: warning.loc?.line,
			column: warning.loc?.column,
		}));

		const result: BuildExtensionResult = {
			name,
			path,
			ok,
			durationMs: Date.now() - taskStart,
			details: {
				bundles: buildResult.bundles,
				dependencies: buildResult.dependencies,
				standalone: buildResult.standalone,
			},
		};

		if (warnings.length > 0)
		{
			result.warnings = warnings;
		}

		if (!ok)
		{
			const firstError = buildResult.errors[0];
			result.error = {
				code: firstError.code ?? CF.UNEXPECTED_BUILD_ERROR,
				message: firstError.message,
				file: firstError.loc?.file,
				line: firstError.loc?.line,
				column: firstError.loc?.column,
			};
		}

		return result;
	}
	catch (error)
	{
		return {
			name,
			path,
			ok: false,
			durationMs: Date.now() - taskStart,
			error: toErrorPayload(error, CF.UNEXPECTED_BUILD_ERROR),
		};
	}
}

function emptyResult(command: string, startedAt: number, error: ChefErrorPayload): BuildApiResult
{
	return {
		ok: false,
		command,
		extensions: [],
		notFound: [],
		error,
		summary: {
			total: 0,
			passed: 0,
			failed: 0,
			durationMs: Date.now() - startedAt,
			bundlesSize: 0,
			warningCount: 0,
		},
	};
}
