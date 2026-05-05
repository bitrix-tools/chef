import * as path from 'node:path';
import * as fs from 'node:fs';

import { CF } from '../diagnostics/diagnostic-codes';
import { Environment } from '../environment/environment';
import { FileFinder } from '../utils/file-finder';
import { loadTsConfig } from '../utils/load-tsconfig';
import { checkTypes } from '../modules/engines/build/rollup/plugins/typescript';

import { initializeEnvironment } from './initialize-environment';
import { toErrorPayload } from './to-error-payload';
import { resolveTargets, type TargetSelector } from './resolve-targets';

import type { BasePackage } from '../modules/packages/base-package';
import type { BaseApiOptions, ChefErrorPayload, ChefExtensionResult, ChefResult } from './types';

export type TypecheckSingleOptions = {
	files?: string[],
	exclude?: string[],
};

export type TypecheckOptions = BaseApiOptions & TargetSelector & TypecheckSingleOptions;

export type TypecheckMessage = {
	code?: string,
	message: string,
	file?: string,
	line?: number,
	column?: number,
	frame?: string,
};

export type TypecheckDetails = {
	skipped: boolean,
	skipReason?: string,
	errors: TypecheckMessage[],
};

export type TypecheckExtensionResult = ChefExtensionResult<TypecheckDetails>;

export type TypecheckSummaryExtras = {
	errorCount: number,
	skippedCount: number,
};

export type TypecheckApiResult = ChefResult<TypecheckDetails, TypecheckSummaryExtras>;

export async function typecheck(options: TypecheckOptions = {}): Promise<TypecheckApiResult>
{
	const startedAt = Date.now();
	const cwd = options.cwd ?? process.cwd();
	const command = 'typecheck';

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return emptyResult(command, startedAt, envError);
	}

	const extensions: TypecheckExtensionResult[] = [];
	let resolvedNotFound: TypecheckApiResult['notFound'] = [];

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
			extensions.push(await typecheckSinglePackage(extensionPackage, options));
		}
	}
	catch (error)
	{
		return emptyResult(command, startedAt, toErrorPayload(error, CF.PACKAGE_READ_ERROR));
	}

	const passed = extensions.filter((extension) => extension.ok).length;
	const failed = extensions.length - passed;

	const { errorCount, skippedCount } = extensions.reduce(
		(acc, extension) => {
			if (extension.details)
			{
				acc.errorCount += extension.details.errors.length;
				if (extension.details.skipped)
				{
					acc.skippedCount += 1;
				}
			}
			return acc;
		},
		{ errorCount: 0, skippedCount: 0 },
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
			errorCount,
			skippedCount,
		},
	};
}

export async function typecheckSinglePackage(
	extensionPackage: BasePackage,
	options: TypecheckSingleOptions = {},
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
			ok: true,
			durationMs: Date.now() - taskStart,
			details: {
				skipped: true,
				skipReason: 'Not a TypeScript extension',
				errors: [],
			},
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
			const notFound = files.filter((file) => !fs.existsSync(file));
			if (notFound.length > 0)
			{
				return {
					name,
					path: packageRoot,
					ok: false,
					durationMs: Date.now() - taskStart,
					details: {
						skipped: false,
						errors: notFound.map((file) => ({
							code: CF.NOT_FOUND,
							message: `File not found: ${path.relative(packageRoot, file)}`,
						})),
					},
					error: {
						code: CF.NOT_FOUND,
						message: `${notFound.length} file(s) not found`,
					},
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

		const errors: TypecheckMessage[] = result.errors.map((error) => ({
			code: error.code,
			message: error.message,
			file: error.loc?.file,
			line: error.loc?.line,
			column: error.loc?.column,
			frame: error.frame,
		}));

		const ok = errors.length === 0;

		return {
			name,
			path: packageRoot,
			ok,
			durationMs: Date.now() - taskStart,
			details: { skipped: false, errors },
			error: ok ? undefined : {
				code: CF.TS_TYPE_ERROR,
				message: `Type check failed with ${errors.length} error(s)`,
			},
		};
	}
	catch (error)
	{
		return {
			name,
			path: packageRoot,
			ok: false,
			durationMs: Date.now() - taskStart,
			error: toErrorPayload(error, CF.TS_TYPE_ERROR),
		};
	}
}

function emptyResult(command: string, startedAt: number, error: ChefErrorPayload): TypecheckApiResult
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
			errorCount: 0,
			skippedCount: 0,
		},
	};
}
