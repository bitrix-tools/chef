import { CF } from '../../diagnostics/diagnostic-codes';

import { buildMeta } from './meta';
import { initializeEnvironment } from './initialize-environment';
import { toErrorPayload } from './to-error-payload';
import { resolveTargets, type TargetSelector } from './resolve-targets';

import type { BuildResult as EngineBuildResult } from '../../modules/engines/build/build-types';
import type { BasePackage } from '../../modules/packages/base-package';
import type {
	JsonInputOptions, JsonErrorPayload, JsonExtensionResult,
	JsonOperationResult, JsonNotFoundEntry,
} from './types';

export type BuildOptions = JsonInputOptions & TargetSelector & {
	force?: boolean,
};

export type BuildBundle = {
	file: string,
	size: number,
};

export type BuildDetails = {
	bundles: BuildBundle[],
	dependencies: string[],
	standalone: boolean,
};

export type BuildExtensionResult = JsonExtensionResult<BuildDetails>;

export type BuildSummaryExtras = {};

export type BuildJsonResult = JsonOperationResult<BuildDetails, BuildSummaryExtras>;

export async function build(options: BuildOptions = {}): Promise<BuildJsonResult>
{
	const startedAt = Date.now();
	const cwd = options.cwd ?? process.cwd();
	const command = 'build';

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return fatalResult(command, cwd, startedAt, envError);
	}

	const extensions: BuildExtensionResult[] = [];
	let notFound: JsonNotFoundEntry[] = [];

	try
	{
		const targets = await resolveTargets(options);
		if (targets.error)
		{
			return fatalResult(command, cwd, startedAt, targets.error);
		}

		notFound = targets.notFound;

		for (const extensionPackage of targets.found)
		{
			extensions.push(await buildOne(extensionPackage, options.force));
		}
	}
	catch (error)
	{
		return fatalResult(command, cwd, startedAt, toErrorPayload(error, CF.PACKAGE_READ_ERROR));
	}

	return {
		...buildMeta(cwd),
		success: extensions.every((extension) => extension.success),
		command,
		extensions,
		notFound,
		summary: aggregateSummary(extensions, startedAt),
	};
}

async function buildOne(extensionPackage: BasePackage, force?: boolean): Promise<BuildExtensionResult>
{
	const taskStart = Date.now();
	const name = extensionPackage.getName();
	const path = extensionPackage.getPath();

	try
	{
		const buildResult: EngineBuildResult = await extensionPackage.build({ force });

		const warnings: JsonErrorPayload[] = buildResult.warnings.map((warning) => ({
			code: warning.code ?? CF.UNKNOWN_BUILD_WARNING,
			message: warning.message,
			file: warning.loc?.file,
			line: warning.loc?.line,
			column: warning.loc?.column,
			frame: warning.frame,
		}));

		const errors: JsonErrorPayload[] = buildResult.errors.map((engineError) => ({
			code: engineError.code ?? CF.UNEXPECTED_BUILD_ERROR,
			message: engineError.message,
			file: engineError.loc?.file,
			line: engineError.loc?.line,
			column: engineError.loc?.column,
			frame: engineError.frame,
		}));

		const bundles: BuildBundle[] = buildResult.bundles.map((bundle) => ({
			file: bundle.fileName,
			size: bundle.size,
		}));

		return {
			name,
			path,
			success: errors.length === 0,
			durationMs: Date.now() - taskStart,
			details: {
				bundles,
				dependencies: buildResult.dependencies,
				standalone: buildResult.standalone,
			},
			errors,
			warnings,
		};
	}
	catch (error)
	{
		return {
			name,
			path,
			success: false,
			durationMs: Date.now() - taskStart,
			details: {
				bundles: [],
				dependencies: [],
				standalone: false,
			},
			errors: [toErrorPayload(error, CF.UNEXPECTED_BUILD_ERROR)],
			warnings: [],
		};
	}
}

function aggregateSummary(extensions: BuildExtensionResult[], startedAt: number)
{
	const passed = extensions.filter((extension) => extension.success).length;
	const errorCount = extensions.reduce((acc, extension) => acc + extension.errors.length, 0);
	const warningCount = extensions.reduce((acc, extension) => acc + extension.warnings.length, 0);

	return {
		total: extensions.length,
		passed,
		failed: extensions.length - passed,
		durationMs: Date.now() - startedAt,
		errorCount,
		warningCount,
	};
}

function fatalResult(command: string, cwd: string, startedAt: number, error: JsonErrorPayload): BuildJsonResult
{
	return {
		...buildMeta(cwd),
		success: false,
		command,
		extensions: [],
		notFound: [],
		error,
		summary: {
			total: 0,
			passed: 0,
			failed: 0,
			durationMs: Date.now() - startedAt,
			errorCount: 0,
			warningCount: 0,
		},
	};
}
