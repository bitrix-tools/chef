import { CF } from '../../diagnostics/diagnostic-codes';
import { Environment } from '../../environment/environment';
import {
	findPlaywrightConfig,
	getBrowsersFromConfig,
} from '../../modules/engines/test/unit/playwright/find-playwright-config';

import { buildMeta } from './meta';
import { extractFrameFromStack } from './extract-frame';
import { initializeEnvironment } from './initialize-environment';
import { toErrorPayload } from './to-error-payload';
import { resolveTargets, type TargetSelector } from './resolve-targets';
import { extensionTarget, moduleTarget, runE2eForTarget, type E2eTarget } from '../../commands/test/e2e-target';
import { detectCurrentModule, getModuleTests } from '../../commands/test/module-tests-dir';

import type {
	TestResult as EngineTestResult,
	BrowserType,
	ConsoleLog,
	TestAttachment,
} from '../../modules/engines/test/test-types';

const KNOWN_BROWSERS: Record<string, BrowserType> = {
	chromium: 'chromium',
	firefox: 'firefox',
	webkit: 'webkit',
};
import type { BasePackage } from '../../modules/packages/base-package';
import type {
	JsonInputOptions, JsonErrorPayload, JsonExtensionResult,
	JsonOperationResult, JsonNotFoundEntry,
} from './types';

export type TestKind = 'unit' | 'e2e' | 'all';

export type TestOptions = JsonInputOptions & TargetSelector & {
	kind?: TestKind,
	headed?: boolean,
	debug?: boolean,
	grep?: string,
	file?: string,
	project?: string | string[],
	// List tests without running them (--list).
	listOnly?: boolean,
};

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'listed';

export type BrowserTestResult = {
	status: TestStatus,
	durationMs?: number,
	failure?: TestFailure,
	// Per-test artifacts (screenshot / video / trace) produced for this browser, so a
	// consumer of the report has the paths directly instead of scraping them off disk.
	attachments?: TestAttachment[],
};

export type TestFailure = {
	message: string,
	file?: string,
	line?: number,
	column?: number,
	/** Code frame around the failing line — populated when the source file can be read. */
	frame?: string,
	/** Diff payload from the assertion library (e.g. assert.deepEqual). */
	diff?: {
		actual: unknown,
		expected: unknown,
	},
};

export type TestEntry = {
	suite: string[],
	title: string,
	status: TestStatus,
	results: Record<string, BrowserTestResult>,   // key: browser name
};

export type TestKindDetails = {
	ran: boolean,
	// True when this kind was only listed (--list), not run.
	listed?: boolean,
	skipReason?: string,
	durationMs: number,
	browsers: string[],
	passed: number,
	failed: number,
	skipped: number,
	total: number,
	tests: TestEntry[],
	consoleLogs: ConsoleLog[],
	// Run-level errors not tied to a single test — a broken config, a spec that won't
	// compile, a crashed process. Without these a failed run would serialize as an empty
	// success (total: 0, failed: 0), masking the failure for tooling that reads --json.
	runErrors: JsonErrorPayload[],
};

export type TestDetails = {
	unit: TestKindDetails,
	e2e: TestKindDetails,
};

export type TestExtensionResult = JsonExtensionResult<TestDetails>;

export type TestSummaryExtras = {
	tests: {
		total: number,
		passed: number,
		failed: number,
		skipped: number,
	},
};

export type TestJsonResult = JsonOperationResult<TestDetails, TestSummaryExtras>;

const UNKNOWN_BROWSER = 'unknown';

export async function test(options: TestOptions = {}): Promise<TestJsonResult>
{
	const startedAt = Date.now();
	const cwd = options.cwd ?? process.cwd();
	const command = 'test';

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return fatalResult(command, cwd, startedAt, envError);
	}

	const extensions: TestExtensionResult[] = [];
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
			extensions.push(await testOne(extensionPackage, options));
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

/**
 * JSON test run for module scenario suites. Mirrors `test()`, but each target is a module
 * (name + tests dir) instead of an extension. Modules have no unit tests, so only e2e runs;
 * everything else (merger, failure collection, summary, top-level shape) is shared.
 */
export async function testModules(moduleNames: string[], options: TestOptions = {}): Promise<TestJsonResult>
{
	const startedAt = Date.now();
	const cwd = options.cwd ?? process.cwd();
	const command = 'test';

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return fatalResult(command, cwd, startedAt, envError);
	}

	// No module given → the one the cwd belongs to (same rule as the non-JSON path). An
	// unresolved target is a valid JSON result, not a thrown/printed error, so tooling
	// that reads --json always gets parseable output.
	const targets = moduleNames.length > 0 ? moduleNames : [detectCurrentModule()].filter(Boolean) as string[];

	const extensions: TestExtensionResult[] = [];
	const notFound: JsonNotFoundEntry[] = [];

	if (targets.length === 0)
	{
		notFound.push({ name: '<current>', reason: 'no module specified and cwd is not inside a module' });
	}

	try
	{
		for (const moduleName of targets)
		{
			extensions.push(await testModuleOne(moduleName, options));
		}
	}
	catch (error)
	{
		return fatalResult(command, cwd, startedAt, toErrorPayload(error, CF.PACKAGE_READ_ERROR));
	}

	return {
		...buildMeta(cwd),
		success: notFound.length === 0 && extensions.every((extension) => extension.success),
		command,
		extensions,
		notFound,
		summary: aggregateSummary(extensions, startedAt),
	};
}

async function testModuleOne(moduleName: string, options: TestOptions): Promise<TestExtensionResult>
{
	const target = moduleTarget(moduleName);
	const taskStart = Date.now();

	try
	{
		// Modules run e2e only; unit is always empty for them.
		const unit = emptyKind('modules have no unit tests');
		const e2e = options.kind === 'unit'
			? emptyKind('filtered by --kind unit')
			: await runE2E(target, options);

		const errors: JsonErrorPayload[] = [...collectFailures(e2e)];

		return {
			name: target.name,
			path: target.path,
			success: e2e.failed === 0 && errors.length === 0,
			durationMs: Date.now() - taskStart,
			details: { unit, e2e },
			errors,
			warnings: [],
		};
	}
	catch (error)
	{
		return {
			name: target.name,
			path: target.path,
			success: false,
			durationMs: Date.now() - taskStart,
			details: { unit: emptyKind(), e2e: emptyKind() },
			errors: [toErrorPayload(error, CF.TEST_FAILED)],
			warnings: [],
		};
	}
}

async function testOne(
	extensionPackage: BasePackage,
	options: TestOptions,
): Promise<TestExtensionResult>
{
	const taskStart = Date.now();
	const name = extensionPackage.getName();
	const path = extensionPackage.getPath();
	const kind: TestKind = options.kind ?? 'all';

	try
	{
		let unit: TestKindDetails;
		let e2e: TestKindDetails;

		if (kind === 'e2e')
		{
			unit = emptyKind('filtered by --kind e2e');
		}
		else
		{
			unit = await runUnit(extensionPackage, options);
		}

		if (kind === 'unit')
		{
			e2e = emptyKind('filtered by --kind unit');
		}
		else
		{
			e2e = await runE2E(extensionTarget(extensionPackage), options);
		}

		const errors: JsonErrorPayload[] = [
			...collectFailures(unit),
			...collectFailures(e2e),
		];

		return {
			name,
			path,
			// A run-level error (broken config, crash) fails the run even when no individual
			// test reported a failure — otherwise a fully broken run serializes as success.
			success: unit.failed + e2e.failed === 0 && errors.length === 0,
			durationMs: Date.now() - taskStart,
			details: { unit, e2e },
			errors,
			warnings: [],
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
				unit: emptyKind(),
				e2e: emptyKind(),
			},
			errors: [toErrorPayload(error, CF.TEST_FAILED)],
			warnings: [],
		};
	}
}

async function runUnit(extensionPackage: BasePackage, options: TestOptions): Promise<TestKindDetails>
{
	const hasUnit = await extensionPackage.hasUnitTests();
	if (!hasUnit)
	{
		return emptyKind('no unit tests');
	}

	const browsers = await resolveUnitBrowsers(extensionPackage, options);
	const merger = createMerger();
	const allLogs: ConsoleLog[] = [];
	let durationMs = 0;

	for (const browserType of browsers)
	{
		const runStart = Date.now();
		const result = await extensionPackage.runUnitTests({
			headed: options.headed,
			debug: options.debug,
			grep: options.grep,
			file: options.file,
			browserType,
			listOnly: options.listOnly,
		});
		merger.absorb(result, browserType);
		allLogs.push(...result.consoleLogs);
		durationMs += Date.now() - runStart;
	}

	return merger.finish(durationMs, allLogs);
}

export async function resolveUnitBrowsers(extensionPackage: BasePackage, options: TestOptions): Promise<BrowserType[]>
{
	if (options.project !== undefined)
	{
		const projects = Array.isArray(options.project) ? options.project : [options.project];
		const fromProjects = projects
			.map((project) => KNOWN_BROWSERS[project])
			.filter(Boolean);
		if (fromProjects.length > 0)
		{
			return fromProjects;
		}
	}

	// Only used to enumerate browser projects. A config that fails to load must not abort
	// the whole run here — let the strategy hit it and report a clean PLAYWRIGHT_ERROR via
	// runErrors. Fall back to the default browser set so the run reaches the strategy.
	let config = null;
	try
	{
		config = await findPlaywrightConfig(extensionPackage.getPath(), Environment.getRoot() ?? extensionPackage.getPath());
	}
	catch
	{
		// Swallowed on purpose — the strategy re-loads the config and surfaces the real error.
	}

	return getBrowsersFromConfig(config);
}

async function runE2E(target: E2eTarget, options: TestOptions): Promise<TestKindDetails>
{
	const hasE2e = (await target.listTests()).length > 0;
	if (!hasE2e)
	{
		return emptyKind('no e2e tests');
	}

	const merger = createMerger();
	const runStart = Date.now();
	const result = await runE2eForTarget(target, {
		headed: options.headed,
		debug: options.debug,
		grep: options.grep,
		file: options.file,
		project: options.project,
		listOnly: options.listOnly,
	});
	merger.absorb(result);
	const durationMs = Date.now() - runStart;

	return merger.finish(durationMs, [...result.consoleLogs]);
}

type Merger = {
	absorb(result: EngineTestResult, fallbackBrowser?: string): void,
	finish(durationMs: number, consoleLogs: ConsoleLog[]): TestKindDetails,
};

/**
 * Builds suite-aware test entries from a stream of TestTokens.
 * Suite path is derived from the SUITE_START/SUITE_END stack — token.suite
 * isn't reliable across all strategies (mocha-wrapper does not populate it).
 */
function createMerger(): Merger
{
	const map = new Map<string, TestEntry>();
	const browsers = new Set<string>();
	const runErrors: JsonErrorPayload[] = [];

	const keyOf = (suite: string[], title: string): string => {
		return JSON.stringify([...suite, title]);
	};

	const upsert = (suite: string[], title: string): TestEntry => {
		const key = keyOf(suite, title);
		const existing = map.get(key);
		if (existing)
		{
			return existing;
		}
		const entry: TestEntry = { suite, title, status: 'passed', results: {} };
		map.set(key, entry);
		return entry;
	};

	return {
		absorb(result, fallbackBrowser)
		{
			for (const error of result.errors)
			{
				runErrors.push(toErrorPayload(error, CF.PLAYWRIGHT_ERROR));
			}

			const stack: string[] = [];

			for (const token of result.report)
			{
				if (token.id === 'SUITE_START')
				{
					if (!token.root && token.title)
					{
						stack.push(token.title);
					}
					continue;
				}

				if (token.id === 'SUITE_END')
				{
					if (!token.root && stack.length > 0)
					{
						stack.pop();
					}
					continue;
				}

				if (
					token.id !== 'TEST_PASSED' && token.id !== 'TEST_FAILED'
					&& token.id !== 'TEST_PENDING' && token.id !== 'TEST_LISTED'
				)
				{
					continue;
				}

				const suite = token.suite && token.suite.length > 0 ? token.suite : [...stack];
				const title = token.title ?? '';
				const browser = token.browser ?? fallbackBrowser ?? UNKNOWN_BROWSER;

				browsers.add(browser);

				const entry = upsert(suite, title);

				const status: TestStatus = token.id === 'TEST_PASSED'
					? 'passed'
					: token.id === 'TEST_FAILED' ? 'failed'
						: token.id === 'TEST_LISTED' ? 'listed' : 'skipped';

				const browserResult: BrowserTestResult = { status };
				if (typeof token.duration === 'number')
				{
					browserResult.durationMs = token.duration;
				}
				if (status === 'failed')
				{
					browserResult.failure = buildFailure(token);
				}
				if (token.attachments && token.attachments.length > 0)
				{
					browserResult.attachments = token.attachments;
				}

				entry.results[browser] = browserResult;
			}
		},
		finish(durationMs, consoleLogs)
		{
			const tests: TestEntry[] = [];
			const browserList = [...browsers];
			let passed = 0;
			let failed = 0;
			let skipped = 0;
			let listed = 0;

			for (const entry of map.values())
			{
				const status = aggregateStatus(entry.results, browserList);
				entry.status = status;
				if (status === 'failed')
				{
					failed++;
				}
				else if (status === 'skipped')
				{
					skipped++;
				}
				else if (status === 'listed')
				{
					listed++;
				}
				else
				{
					passed++;
				}
				tests.push(entry);
			}

			return {
				ran: listed === 0,
				listed: listed > 0,
				durationMs,
				browsers: browserList,
				passed,
				failed,
				skipped,
				total: passed + failed + skipped + listed,
				tests,
				consoleLogs,
				runErrors,
			};
		},
	};
}

function buildFailure(token: { error?: { message: string, stack?: string }, showDiff?: boolean, actual?: unknown, expected?: unknown }): TestFailure
{
	const failure: TestFailure = {
		message: token.error?.message ?? 'Unknown error',
	};

	const location = extractFrameFromStack(token.error?.stack);
	if (location)
	{
		failure.file = location.file;
		failure.line = location.line;
		failure.column = location.column;
		failure.frame = location.frame;
	}

	if (token.showDiff)
	{
		failure.diff = {
			actual: token.actual,
			expected: token.expected,
		};
	}

	return failure;
}

function aggregateStatus(results: Record<string, BrowserTestResult>, browsers: string[]): TestStatus
{
	// --list: every browser reports the test as 'listed' (never run), so the aggregate is
	// 'listed'. This is checked first — a listed test has no pass/fail/skip to weigh.
	const values = browsers.map((browser) => results[browser]).filter(Boolean);
	if (values.length > 0 && values.every((result) => result.status === 'listed'))
	{
		return 'listed';
	}

	let allSkipped = true;
	for (const browser of browsers)
	{
		const result = results[browser];
		if (!result)
		{
			continue;
		}
		if (result.status === 'failed')
		{
			return 'failed';
		}
		if (result.status !== 'skipped')
		{
			allSkipped = false;
		}
	}
	return allSkipped ? 'skipped' : 'passed';
}

export function collectFailures(kind: TestKindDetails): JsonErrorPayload[]
{
	// Run-level errors (broken config, spec that won't compile, crashed process) first —
	// these explain why there may be no per-test failures to report at all.
	const failures: JsonErrorPayload[] = [...kind.runErrors];

	for (const entry of kind.tests)
	{
		if (entry.status !== 'failed')
		{
			continue;
		}

		const title = [...entry.suite, entry.title].filter(Boolean).join(' › ');

		for (const [browser, browserResult] of Object.entries(entry.results))
		{
			if (browserResult.status !== 'failed' || !browserResult.failure)
			{
				continue;
			}

			const { failure } = browserResult;
			const payload: JsonErrorPayload = {
				code: CF.TEST_FAILED,
				message: `[${browser}] ${title}: ${failure.message}`,
			};
			if (failure.file !== undefined)
			{
				payload.file = failure.file;
			}
			if (failure.line !== undefined)
			{
				payload.line = failure.line;
			}
			if (failure.column !== undefined)
			{
				payload.column = failure.column;
			}
			if (failure.frame !== undefined)
			{
				payload.frame = failure.frame;
			}
			failures.push(payload);
		}
	}

	return failures;
}

function emptyKind(skipReason?: string): TestKindDetails
{
	const details: TestKindDetails = {
		ran: false,
		durationMs: 0,
		browsers: [],
		passed: 0,
		failed: 0,
		skipped: 0,
		total: 0,
		tests: [],
		consoleLogs: [],
		runErrors: [],
	};
	if (skipReason)
	{
		details.skipReason = skipReason;
	}
	return details;
}

function aggregateSummary(extensions: TestExtensionResult[], startedAt: number)
{
	const passed = extensions.filter((extension) => extension.success).length;
	let testsTotal = 0;
	let testsPassed = 0;
	let testsFailed = 0;
	let testsSkipped = 0;
	let errorCount = 0;
	let warningCount = 0;

	for (const extension of extensions)
	{
		const { unit, e2e } = extension.details;
		testsTotal += unit.total + e2e.total;
		testsPassed += unit.passed + e2e.passed;
		testsFailed += unit.failed + e2e.failed;
		testsSkipped += unit.skipped + e2e.skipped;
		errorCount += extension.errors.length;
		warningCount += extension.warnings.length;
	}

	return {
		total: extensions.length,
		passed,
		failed: extensions.length - passed,
		durationMs: Date.now() - startedAt,
		errorCount,
		warningCount,
		tests: {
			total: testsTotal,
			passed: testsPassed,
			failed: testsFailed,
			skipped: testsSkipped,
		},
	};
}

function fatalResult(command: string, cwd: string, startedAt: number, error: JsonErrorPayload): TestJsonResult
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
			tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
		},
	};
}

