import { CF } from '../../diagnostics/diagnostic-codes';

import { buildMeta } from './meta';
import { initializeEnvironment } from './initialize-environment';
import { toErrorPayload } from './to-error-payload';
import { resolveTargets, type TargetSelector } from './resolve-targets';

import type { LintResult as EngineLintResult } from '../../modules/engines/lint/lint-types';
import type { BasePackage } from '../../modules/packages/base-package';
import type {
	JsonInputOptions, JsonErrorPayload, JsonExtensionResult,
	JsonOperationResult, JsonNotFoundEntry,
} from './types';

export type LintOptions = JsonInputOptions & TargetSelector & {
	fix?: boolean,
	files?: string[],
	cache?: boolean,
	exclude?: string[],
};

export type LintDetails = {
	errorCount: number,
	warningCount: number,
	fixedCount: number,
	skipped: boolean,
	skipReason?: string,
};

export type LintExtensionResult = JsonExtensionResult<LintDetails>;
export type LintSummaryExtras = {
	fixedCount: number,
};

export type LintJsonResult = JsonOperationResult<LintDetails, LintSummaryExtras>;

export async function lint(options: LintOptions = {}): Promise<LintJsonResult>
{
	const startedAt = Date.now();
	const cwd = options.cwd ?? process.cwd();
	const command = 'lint';

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return fatalResult(command, cwd, startedAt, envError);
	}

	const extensions: LintExtensionResult[] = [];
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
			extensions.push(await lintOne(extensionPackage, options));
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

async function lintOne(
	extensionPackage: BasePackage,
	options: LintOptions,
): Promise<LintExtensionResult>
{
	const taskStart = Date.now();
	const name = extensionPackage.getName();
	const path = extensionPackage.getPath();

	try
	{
		const lintResult: EngineLintResult = await extensionPackage.lint({
			fix: options.fix,
			files: options.files,
			cache: options.cache,
			exclude: options.exclude,
		});

		const errorCount = lintResult.getErrorsCount();
		const warningCount = lintResult.getWarningsCount();
		const fixedCount = lintResult.getFixedCount();

		const errors: JsonErrorPayload[] = [];
		const warnings: JsonErrorPayload[] = [];
		for (const file of lintResult.files)
		{
			for (const message of file.messages)
			{
				const payload: JsonErrorPayload = {
					code: message.ruleId ?? CF.LINT_FAILED,
					message: message.message,
					file: file.filePath,
					line: message.line,
					column: message.column,
				};
				if (message.severity === 'error')
				{
					errors.push(payload);
				}
				else
				{
					warnings.push(payload);
				}
			}
		}

		return {
			name,
			path,
			success: errorCount === 0,
			durationMs: Date.now() - taskStart,
			details: {
				errorCount,
				warningCount,
				fixedCount,
				skipped: lintResult.skipped ?? false,
				skipReason: lintResult.skipReason,
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
				errorCount: 0,
				warningCount: 0,
				fixedCount: 0,
				skipped: false,
			},
			errors: [toErrorPayload(error, CF.LINT_FAILED)],
			warnings: [],
		};
	}
}

function aggregateSummary(extensions: LintExtensionResult[], startedAt: number)
{
	const passed = extensions.filter((extension) => extension.success).length;
	let errorCount = 0;
	let warningCount = 0;
	let fixedCount = 0;
	for (const extension of extensions)
	{
		errorCount += extension.details.errorCount;
		warningCount += extension.details.warningCount;
		fixedCount += extension.details.fixedCount;
	}

	return {
		total: extensions.length,
		passed,
		failed: extensions.length - passed,
		durationMs: Date.now() - startedAt,
		errorCount,
		warningCount,
		fixedCount,
	};
}

function fatalResult(command: string, cwd: string, startedAt: number, error: JsonErrorPayload): LintJsonResult
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
			fixedCount: 0,
		},
	};
}
