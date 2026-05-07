import * as path from 'node:path';
import * as fs from 'node:fs';

import { CF } from '../../diagnostics/diagnostic-codes';
import { Environment } from '../../environment/environment';
import { FileFinder } from '../../utils/file-finder';
import { loadTsConfig } from '../../utils/load-tsconfig';
import { checkTypes } from '../../modules/engines/build/rollup/plugins/typescript';

import { buildMeta } from './meta';
import { initializeEnvironment } from './initialize-environment';
import { toErrorPayload } from './to-error-payload';
import { resolveTargets, type TargetSelector } from './resolve-targets';

import type { BasePackage } from '../../modules/packages/base-package';
import type {
	JsonInputOptions, JsonErrorPayload, JsonExtensionResult,
	JsonOperationResult, JsonNotFoundEntry,
} from './types';

export type TypecheckOptions = JsonInputOptions & TargetSelector & {
	files?: string[],
	exclude?: string[],
};

export type TypecheckDetails = {
	skipped: boolean,
	skipReason?: string,
	errorCount: number,
};

export type TypecheckExtensionResult = JsonExtensionResult<TypecheckDetails>;

export type TypecheckSummaryExtras = {
	skippedCount: number,
};

export type TypecheckJsonResult = JsonOperationResult<TypecheckDetails, TypecheckSummaryExtras>;

export async function typecheck(options: TypecheckOptions = {}): Promise<TypecheckJsonResult>
{
	const startedAt = Date.now();
	const cwd = options.cwd ?? process.cwd();
	const command = 'typecheck';

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return fatalResult(command, cwd, startedAt, envError);
	}

	const extensions: TypecheckExtensionResult[] = [];
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
			extensions.push(await typecheckOne(extensionPackage, options));
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

async function typecheckOne(
	extensionPackage: BasePackage,
	options: TypecheckOptions,
): Promise<TypecheckExtensionResult>
{
	const taskStart = Date.now();
	const name = extensionPackage.getName();
	const packageRoot = extensionPackage.getPath();

	if (!extensionPackage.isTypeScriptMode())
	{
		return {
			name,
			path: packageRoot,
			success: true,
			durationMs: Date.now() - taskStart,
			details: {
				skipped: true,
				skipReason: 'Not a TypeScript extension',
				errorCount: 0,
			},
			errors: [],
			warnings: [],
		};
	}

	try
	{
		const inputPath = extensionPackage.getInputPath();
		const tsConfigPath = FileFinder.findUpFile({
			fileName: 'tsconfig.json',
			fromDir: path.dirname(inputPath),
			rootDir: Environment.getRoot() ?? undefined,
		});

		let compilerOptions: import('typescript').CompilerOptions | undefined;
		if (typeof tsConfigPath === 'string' && tsConfigPath.length > 0)
		{
			const tsConfig = await loadTsConfig(tsConfigPath, packageRoot);
			compilerOptions = tsConfig.options;
		}

		const files = options.files?.map((pattern) => {
			return path.isAbsolute(pattern) ? pattern : path.join(packageRoot, pattern);
		});
		const exclude = options.exclude?.map((pattern) => {
			return path.isAbsolute(pattern) ? pattern : path.join(packageRoot, pattern);
		});

		if (files)
		{
			const missing = files.filter((file) => !fs.existsSync(file));
			if (missing.length > 0)
			{
				const errors: JsonErrorPayload[] = missing.map((file) => ({
					code: CF.NOT_FOUND,
					message: `File not found: ${path.relative(packageRoot, file)}`,
				}));
				return {
					name,
					path: packageRoot,
					success: false,
					durationMs: Date.now() - taskStart,
					details: {
						skipped: false,
						errorCount: errors.length,
					},
					errors,
					warnings: [],
				};
			}
		}

		const result = await checkTypes({
			packageRoot,
			compilerOptions,
			files,
			exclude: [
				extensionPackage.getOutputJsPath(),
				extensionPackage.getOutputCssPath(),
				...(exclude ?? []),
			],
		});

		const errors: JsonErrorPayload[] = result.errors.map((error) => ({
			code: error.code ?? CF.TS_TYPE_ERROR,
			message: error.message,
			file: error.loc?.file,
			line: error.loc?.line,
			column: error.loc?.column,
			frame: error.frame,
		}));

		return {
			name,
			path: packageRoot,
			success: errors.length === 0,
			durationMs: Date.now() - taskStart,
			details: {
				skipped: false,
				errorCount: errors.length,
			},
			errors,
			warnings: [],
		};
	}
	catch (error)
	{
		return {
			name,
			path: packageRoot,
			success: false,
			durationMs: Date.now() - taskStart,
			details: {
				skipped: false,
				errorCount: 1,
			},
			errors: [toErrorPayload(error, CF.TS_TYPE_ERROR)],
			warnings: [],
		};
	}
}

function aggregateSummary(extensions: TypecheckExtensionResult[], startedAt: number)
{
	const passed = extensions.filter((extension) => extension.success).length;
	let errorCount = 0;
	let warningCount = 0;
	let skippedCount = 0;
	for (const extension of extensions)
	{
		errorCount += extension.errors.length;
		warningCount += extension.warnings.length;
		if (extension.details.skipped)
		{
			skippedCount += 1;
		}
	}

	return {
		total: extensions.length,
		passed,
		failed: extensions.length - passed,
		durationMs: Date.now() - startedAt,
		errorCount,
		warningCount,
		skippedCount,
	};
}

function fatalResult(command: string, cwd: string, startedAt: number, error: JsonErrorPayload): TypecheckJsonResult
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
			skippedCount: 0,
		},
	};
}
