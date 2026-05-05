import { CF } from '../diagnostics/diagnostic-codes';

import { initializeEnvironment } from './initialize-environment';
import { toErrorPayload } from './to-error-payload';
import { resolveTargets, type TargetSelector } from './resolve-targets';

import type { LintFileResult, LintResult as EngineLintResult } from '../modules/engines/lint/lint-types';
import type { BasePackage } from '../modules/packages/base-package';
import type { BaseApiOptions, ChefErrorPayload, ChefExtensionResult, ChefResult } from './types';

export type LintSingleOptions = {
	fix?: boolean,
	files?: string[],
	cache?: boolean,
	exclude?: string[],
};

export type LintOptions = BaseApiOptions & TargetSelector & LintSingleOptions;

export type LintFileMessage = {
	ruleId: string | null,
	severity: 'error' | 'warning',
	line: number,
	column: number,
	message: string,
};

export type LintFileEntry = {
	filePath: string,
	messages: LintFileMessage[],
};

export type LintDetails = {
	errorCount: number,
	warningCount: number,
	skipped: boolean,
	skipReason?: string,
	files: LintFileEntry[],
};

export type LintExtensionResult = ChefExtensionResult<LintDetails>;
export type LintSummaryExtras = {
	errorCount: number,
	warningCount: number,
};

export type LintApiResult = ChefResult<LintDetails, LintSummaryExtras>;

export async function lint(options: LintOptions = {}): Promise<LintApiResult>
{
	const startedAt = Date.now();
	const cwd = options.cwd ?? process.cwd();
	const command = 'lint';

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return emptyResult(command, startedAt, envError);
	}

	const extensions: LintExtensionResult[] = [];
	let resolvedNotFound: LintApiResult['notFound'] = [];

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
			extensions.push(await lintSinglePackage(extensionPackage, options));
		}
	}
	catch (error)
	{
		return emptyResult(command, startedAt, toErrorPayload(error, CF.PACKAGE_READ_ERROR));
	}

	const passed = extensions.filter((extension) => extension.ok).length;
	const failed = extensions.length - passed;

	const { errorCount, warningCount } = extensions.reduce(
		(acc, extension) => {
			if (extension.details)
			{
				acc.errorCount += extension.details.errorCount;
				acc.warningCount += extension.details.warningCount;
			}
			return acc;
		},
		{ errorCount: 0, warningCount: 0 },
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
			warningCount,
		},
	};
}

export async function lintSinglePackage(
	extensionPackage: BasePackage,
	options: LintSingleOptions = {},
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
		const ok = errorCount === 0;

		return {
			name,
			path,
			ok,
			durationMs: Date.now() - taskStart,
			details: {
				errorCount,
				warningCount,
				skipped: lintResult.skipped ?? false,
				skipReason: lintResult.skipReason,
				files: lintResult.files
					.filter((file) => file.messages.length > 0)
					.map(toFileEntry),
			},
			error: ok ? undefined : {
				code: CF.LINT_FAILED,
				message: `Lint failed with ${errorCount} error(s)`,
			},
		};
	}
	catch (error)
	{
		return {
			name,
			path,
			ok: false,
			durationMs: Date.now() - taskStart,
			error: toErrorPayload(error, CF.LINT_FAILED),
		};
	}
}

function toFileEntry(file: LintFileResult): LintFileEntry
{
	return {
		filePath: file.filePath,
		messages: file.messages.map((message) => ({
			ruleId: message.ruleId,
			severity: message.severity,
			line: message.line,
			column: message.column,
			message: message.message,
		})),
	};
}

function emptyResult(command: string, startedAt: number, error: ChefErrorPayload): LintApiResult
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
			warningCount: 0,
		},
	};
}
