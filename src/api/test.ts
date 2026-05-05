import { CF } from '../diagnostics/diagnostic-codes';

import { initializeEnvironment } from './initialize-environment';
import { toErrorPayload } from './to-error-payload';
import { resolveTargets, type TargetSelector } from './resolve-targets';

import type { TestResult as EngineTestResult, TestToken, BrowserType } from '../modules/engines/test/test-types';
import type { BasePackage } from '../modules/packages/base-package';
import type { BaseApiOptions, ChefErrorPayload, ChefExtensionResult, ChefResult } from './types';

export type TestKind = 'unit' | 'e2e' | 'all';

export type TestSingleOptions = {
	kind?: TestKind,
	headed?: boolean,
	debug?: boolean,
	grep?: string,
	browsers?: BrowserType[],
	file?: string,
	project?: string | string[],
};

export type TestOptions = BaseApiOptions & TargetSelector & TestSingleOptions;

export type TestFailure = {
	suite: string[],
	title: string,
	message: string,
	stack?: string,
};

export type TestRunDetails = {
	kind: 'unit' | 'e2e',
	passed: number,
	failed: number,
	skipped: number,
	failures: TestFailure[],
};

export type TestDetails = {
	runs: TestRunDetails[],
	passed: number,
	failed: number,
	skipped: number,
};

export type TestExtensionResult = ChefExtensionResult<TestDetails>;

export type TestSummaryExtras = {
	tests: {
		passed: number,
		failed: number,
		skipped: number,
	},
};

export type TestApiResult = ChefResult<TestDetails, TestSummaryExtras>;

export async function test(options: TestOptions = {}): Promise<TestApiResult>
{
	const startedAt = Date.now();
	const cwd = options.cwd ?? process.cwd();
	const command = 'test';

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return emptyResult(command, startedAt, envError);
	}

	const extensions: TestExtensionResult[] = [];
	let resolvedNotFound: TestApiResult['notFound'] = [];

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
			extensions.push(await testSinglePackage(extensionPackage, options));
		}
	}
	catch (error)
	{
		return emptyResult(command, startedAt, toErrorPayload(error, CF.PACKAGE_READ_ERROR));
	}

	const passed = extensions.filter((extension) => extension.ok).length;
	const failed = extensions.length - passed;

	const tests = extensions.reduce(
		(acc, extension) => {
			const details = extension.details;
			if (details)
			{
				acc.passed += details.passed;
				acc.failed += details.failed;
				acc.skipped += details.skipped;
			}
			return acc;
		},
		{ passed: 0, failed: 0, skipped: 0 },
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
			tests,
		},
	};
}

export async function testSinglePackage(
	extensionPackage: BasePackage,
	options: TestSingleOptions = {},
): Promise<TestExtensionResult>
{
	const taskStart = Date.now();
	const name = extensionPackage.getName();
	const path = extensionPackage.getPath();
	const kind: TestKind = options.kind ?? 'all';

	try
	{
		const runs: TestRunDetails[] = [];

		if (kind !== 'e2e' && await extensionPackage.hasUnitTests())
		{
			const browsers: BrowserType[] = options.browsers ?? [];

			if (browsers.length === 0)
			{
				const result = await extensionPackage.runUnitTests({
					headed: options.headed,
					debug: options.debug,
					grep: options.grep,
					file: options.file,
				});
				runs.push(aggregate(result, 'unit'));
			}
			else
			{
				for (const browserType of browsers)
				{
					const result = await extensionPackage.runUnitTests({
						headed: options.headed,
						debug: options.debug,
						grep: options.grep,
						file: options.file,
						browserType,
					});
					runs.push(aggregate(result, 'unit'));
				}
			}
		}

		if (kind !== 'unit' && await extensionPackage.hasEndToEndTests())
		{
			const result = await extensionPackage.runEndToEndTests({
				headed: options.headed,
				debug: options.debug,
				grep: options.grep,
				file: options.file,
				project: options.project,
			});
			runs.push(aggregate(result, 'e2e'));
		}

		const passed = runs.reduce((acc, run) => acc + run.passed, 0);
		const failed = runs.reduce((acc, run) => acc + run.failed, 0);
		const skipped = runs.reduce((acc, run) => acc + run.skipped, 0);

		const ok = failed === 0;

		return {
			name,
			path,
			ok,
			durationMs: Date.now() - taskStart,
			details: { runs, passed, failed, skipped },
			error: ok ? undefined : {
				code: CF.TEST_FAILED,
				message: `${failed} test(s) failed`,
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
			error: toErrorPayload(error, CF.TEST_FAILED),
		};
	}
}

function aggregate(result: EngineTestResult, kind: 'unit' | 'e2e'): TestRunDetails
{
	let passed = 0;
	let failed = 0;
	let skipped = 0;
	const failures: TestFailure[] = [];

	for (const token of result.report)
	{
		if (token.id === 'TEST_PASSED')
		{
			passed++;
		}
		else if (token.id === 'TEST_FAILED')
		{
			failed++;
			failures.push(toFailure(token));
		}
		else if (token.id === 'TEST_PENDING')
		{
			skipped++;
		}
	}

	return { kind, passed, failed, skipped, failures };
}

function toFailure(token: TestToken): TestFailure
{
	return {
		suite: token.suite ?? [],
		title: token.title ?? '',
		message: token.error?.message ?? 'Unknown error',
		stack: token.error?.stack,
	};
}

function emptyResult(command: string, startedAt: number, error: ChefErrorPayload): TestApiResult
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
			tests: { passed: 0, failed: 0, skipped: 0 },
		},
	};
}
