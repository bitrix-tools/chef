import chalk from 'chalk';
import boxen from 'boxen';

import { createReporter } from '../create-reporter';
import { checkBaseUrlWarning } from '../check-env-test';
import { findPlaywrightConfig, getBrowsersFromConfig } from '../../../modules/engines/test/unit/playwright/find-playwright-config';
import { showsBrowserConsole } from '../console-target';
import { Environment } from '../../../environment/environment';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult, TaskDetail } from '../../../modules/task/task-types';
import type { BrowserType, ConsoleLog, TestToken } from '../../../modules/engines/test/test-types';

function deduplicateConsoleLogs(sets: ConsoleLog[][]): ConsoleLog[]
{
	if (sets.length <= 1)
	{
		return sets[0] ?? [];
	}

	// Use the longest set as the base, then add any unique entries from others
	const base = sets.reduce((a, b) => a.length >= b.length ? a : b);
	const seen = new Set(base.map((log) => `${log.type}:${log.text}`));
	const result = [...base];

	for (const set of sets)
	{
		if (set === base)
		{
			continue;
		}

		for (const log of set)
		{
			const key = `${log.type}:${log.text}`;
			if (!seen.has(key))
			{
				seen.add(key);
				result.push(log);
			}
		}
	}

	return result;
}

const KNOWN_BROWSERS: Record<string, BrowserType> = {
	chromium: 'chromium',
	firefox: 'firefox',
	webkit: 'webkit',
};

const BROWSER_LABEL: Record<string, string> = {
	chromium: 'Chromium',
	firefox: 'Firefox',
	webkit: 'WebKit',
};

function createDebugTask(extension: BasePackage, args: Record<string, any>, browsers: string[]): Task
{
	const browserNames = browsers.map((b) => BROWSER_LABEL[b] ?? b);
	const browserList = browserNames.length === 1
		? browserNames[0]
		: browserNames.slice(0, -1).join(', ') + ' and ' + browserNames.at(-1);

	const debugMessage = [
		`${browserList} will open with ${chalk.bold('DevTools')} enabled.`,
		'',
		`${chalk.bold('What you can do:')}`,
		`  • Set breakpoints in source code and test files`,
		`  • Inspect DOM, network requests, and console output`,
		`  • Step through code using the ${chalk.bold('Sources')} panel`,
		`  • Sourcemaps are enabled — debug the original code, not the bundle`,
		'',
		`${chalk.bold('To finish:')} close the browser window or press ${chalk.bold('Ctrl+C')}`,
	].join('\n');

	return {
		title: 'Unit tests',
		run: async (onUpdate): Promise<TaskResult> => {
			console.log('');
			console.log(boxen(debugMessage, {
				padding: 1,
				borderStyle: 'round',
				borderColor: 'cyan',
				title: chalk.bold.cyan('Debug Mode'),
			}));

			for (const browserType of browsers)
			{
				const label = BROWSER_LABEL[browserType] ?? browserType;
				const reporter = createReporter(args.reporter, onUpdate, { showSummary: false });

				const testResult = await extension.runUnitTests({
					...args,
					browserType,
					onToken: (token) => reporter.handleToken(token),
				});

				if (testResult.errors.length > 0)
				{
					const details: TaskDetail[] = testResult.errors.map((error: Error) => ({
						type: 'error' as const,
						code: 'code' in error ? (error as any).code : undefined,
						message: error.message,
						stack: error.stack,
					}));

					return {
						title: `Unit tests (${label})`,
						status: 'failed',
						details,
					};
				}

				if (testResult.report.length > 0)
				{
					reporter.finish({ consoleLogs: showsBrowserConsole(args.console) ? testResult.consoleLogs : [] });
				}

				if (testResult.debugCleanup)
				{
					await testResult.debugCleanup();
				}
			}

			return {
				title: 'Unit tests',
				status: 'passed',
			};
		},
	};
}

export function runUnitTestsTask(extension: BasePackage, args: Record<string, any>): Task
{
	const resolveBrowsers = async (): Promise<BrowserType[]> => {
		if (args.project)
		{
			const projects: string[] = Array.isArray(args.project) ? args.project : [args.project];
			return projects
				.map((project: string) => KNOWN_BROWSERS[project])
				.filter(Boolean);
		}

		const config = await findPlaywrightConfig(extension.getPath(), Environment.getRoot());

		checkBaseUrlWarning(config?.use?.baseURL, extension.getPath());

		return getBrowsersFromConfig(config);
	};

	if (args.debug)
	{
		return {
			title: 'Unit tests',
			run: async (onUpdate): Promise<TaskResult> => {
				const browsers = await resolveBrowsers();
				return createDebugTask(extension, args, browsers).run(onUpdate);
			},
		};
	}

	return {
		title: 'Unit tests',
		run: async (onUpdate): Promise<TaskResult> => {
			const browsers = await resolveBrowsers();
			const reporter = createReporter(args.reporter, onUpdate, { showSummary: false });

			// --list: the test set is identical across browsers, so enumerate in just one
			// (still needs a browser — the bundle's describe/it run to populate the suite).
			if (args.list)
			{
				const listResult = await extension.runUnitTests({
					...args,
					browserType: browsers[0],
					listOnly: true,
					onToken: (token: TestToken) => reporter.handleToken(token, BROWSER_LABEL[browsers[0]] ?? browsers[0]),
				});
				reporter.stop();
				reporter.clearStatus();

				if (listResult.errors.length > 0)
				{
					return {
						title: 'Unit tests (errored)',
						status: 'failed',
						details: listResult.errors.map((error: Error) => ({
							type: 'error' as const,
							code: 'code' in error ? (error as any).code : undefined,
							message: error.message,
							stack: error.stack,
						})),
					};
				}

				const { listing } = reporter.finish();
				const listed = listResult.report.filter((token) => token.id === 'TEST_LISTED').length;

				return {
					title: listed > 0 ? 'Unit tests (listed)' : 'Unit tests (no test files)',
					status: 'skipped',
					metrics: listing ? { listing: { kind: 'unit', ...listing } } : undefined,
				};
			}

			reporter.setBrowserCount(browsers.length);
			// Tell the reporter every browser up front (same labels used in handleToken), so a
			// test's browser tag accumulates all engines (e.g. [Chromium ✓ · Firefox ✓]) rather
			// than showing only the one whose token arrived. e2e does this via onBegin; unit
			// runs browsers in parallel, so we set the full list here before they start.
			reporter.setBrowsers(browsers.map((browserType) => BROWSER_LABEL[browserType] ?? browserType));
			const consoleLogSets: ConsoleLog[][] = [];
			const allErrors: Error[] = [];
			let hasTests = false;

			const promises = browsers.map(async (browserType) => {
				const label = BROWSER_LABEL[browserType] ?? browserType;

				const testResult = await extension.runUnitTests({
					...args,
					browserType,
					onToken: (token) => reporter.handleToken(token, label),
					onStatus: (status) => reporter.updateStatus(status, label),
				});

				if (testResult.errors.length > 0)
				{
					allErrors.push(...testResult.errors);
				}

				const hasTestTokens = testResult.report.some(
					(token) => token.id === 'TEST_PASSED'
						|| token.id === 'TEST_FAILED'
						|| token.id === 'TEST_PENDING',
				);
				if (hasTestTokens)
				{
					hasTests = true;
				}

				if (testResult.consoleLogs.length > 0)
				{
					consoleLogSets.push(testResult.consoleLogs);
				}
			});

			await Promise.all(promises);

			if (allErrors.length > 0)
			{
				const seen = new Set<string>();
				const details: TaskDetail[] = [];
				for (const error of allErrors)
				{
					const code = 'code' in error ? (error as any).code as string | undefined : undefined;
					const key = `${code ?? ''}:${error.message}`;
					if (seen.has(key))
					{
						continue;
					}
					seen.add(key);
					details.push({
						type: 'error',
						code,
						message: error.message,
						stack: error.stack,
					});
				}

				const isBuildErrorCode = (code: unknown): boolean => {
					if (typeof code !== 'string')
					{
						return false;
					}

					if (code.startsWith('CF1'))
					{
						return true;
					}

					// Raw Rollup error codes that surface from buildCode without CF mapping
					return /^[A-Z_]+$/.test(code);
				};

				const allBuildErrors = details.every(
					(detail) => detail.type === 'error' && isBuildErrorCode(detail.code),
				);

				reporter.clearStatus();

				return {
					title: allBuildErrors ? 'Unit tests (build failed)' : 'Unit tests',
					status: 'failed',
					details,
				};
			}

			if (!hasTests)
			{
				reporter.clearStatus();

				const hasFiles = await extension.hasUnitTests();
				if (!hasFiles)
				{
					return {
						title: 'Unit tests (no test files)',
						status: 'skipped',
					};
				}

				const errorLogs: ConsoleLog[] = [];
				const seenLogs = new Set<string>();
				for (const set of consoleLogSets)
				{
					for (const log of set)
					{
						if (log.type !== 'error')
						{
							continue;
						}
						const key = log.text;
						if (seenLogs.has(key))
						{
							continue;
						}
						seenLogs.add(key);
						errorLogs.push(log);
					}
				}

				if (errorLogs.length > 0)
				{
					const details: TaskDetail[] = errorLogs.map((log) => ({
						type: 'error',
						message: log.text,
					}));

					return {
						title: 'Unit tests (crashed before any tests ran)',
						status: 'failed',
						details,
					};
				}

				return {
					title: 'Unit tests (no tests collected)',
					status: 'warning',
					details: [
						{
							type: 'block',
							text: 'Test files exist but Mocha did not collect any tests. Likely causes:\n'
								+ '  • describe/it blocks are empty or all skipped\n'
								+ '  • the test page did not load the runner (check baseURL and /dev/ui/cli/mocha-wrapper.php)\n'
								+ '  • the Bitrix install redirects to authorization\n'
								+ 'Run with --headed or --debug to inspect the page in the browser.',
							color: 'yellow',
						},
					],
				};
			}

			const allConsoleLogs = showsBrowserConsole(args.console) ? deduplicateConsoleLogs(consoleLogSets) : [];
			const { passed, failed, failures, flaky } = reporter.finish({ consoleLogs: allConsoleLogs });

			const title = failed === 0
				? 'Unit tests'
				: `Unit tests (${failed} failed)`;

			return {
				title,
				status: failed === 0 ? 'passed' : 'failed',
				metrics: { passed, failed, failures, flaky },
			};
		},
	};
}
