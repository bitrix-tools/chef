import chalk from 'chalk';
import { Command } from 'commander';
import { SequentialQueue } from '../../utils/sequential-queue';

import { preparePath } from '../../utils/cli/prepare-path';
import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { PackageResolver } from '../../modules/packages/package-resolver';
import { findPackages } from '../../utils/package/find-packages';
import { createShutdown } from '../../utils/create-shutdown';
import { TaskRunner } from '../../modules/task/task-runner';
import { runUnitTestsTask } from './tasks/run-unit-tests-task';
import { runEndToEndTestsTask } from './tasks/run-e2e-tests-task';
import { TeamcityReporter } from '../../modules/engines/test/teamcity-reporter';
import { findPlaywrightConfig, getBrowsersFromConfig } from '../../modules/engines/test/unit/playwright/find-playwright-config';
import { PlaywrightUnitStrategy } from '../../modules/engines/test/unit/playwright/playwright-unit-strategy';
import { Environment } from '../../environment/environment';
import { formatInternalError } from '../../diagnostics/format-error';
import { CF } from '../../diagnostics/diagnostic-codes';
import { printSummary } from '../../shared/print-summary';
import { test as testJson } from '../../reporters/json/test';
import { emitJson } from '../../reporters/json/emit';
import { createReporterOption } from '../../shared/options/reporter-option';

import type { BasePackage } from '../../modules/packages/base-package';
import type { Task, TaskGroupResult } from '../../modules/task/task-types';
import type { BrowserType } from '../../modules/engines/test/test-types';
import type { FSWatcher } from 'chokidar';

type RunTestsOptions = {
	extensions: string[];
	args: Record<string, any>;
	type?: 'unit' | 'e2e';
};

function createExtensionsStream(extensions: string[], args: Record<string, any>): NodeJS.ReadableStream
{
	if (extensions.length > 0)
	{
		return PackageResolver.resolveStream(extensions);
	}

	const packageFactory = PackageFactoryProvider.create();
	return findPackages({
		startDirectory: args.path,
		packageFactory,
	});
}

async function hasTestsForType(extension: BasePackage, type?: 'unit' | 'e2e'): Promise<boolean>
{
	if (type === 'unit')
	{
		return extension.hasUnitTests();
	}

	if (type === 'e2e')
	{
		return extension.hasEndToEndTests();
	}

	const [unit, e2e] = await Promise.all([
		extension.hasUnitTests(),
		extension.hasEndToEndTests(),
	]);

	return unit || e2e;
}

function runTestsTeamcity({ extensions, args, type }: RunTestsOptions): void
{
	const queue = new SequentialQueue();
	const extensionsStream = createExtensionsStream(extensions, args);
	const reporter = new TeamcityReporter();

	extensionsStream
		.on('not-found', ({ message }: { message: string }) => {
			console.log('');
			console.log(message);
		})
		.on('data', async ({ extension, explicit }: { extension: BasePackage; explicit: boolean }) => {
			if (!explicit && !(await hasTestsForType(extension, type)))
			{
				return;
			}

			await queue.add(async () => {
				if (type !== 'e2e')
				{
					const browsers: BrowserType[] = await (async () => {
						if (args.project)
						{
							const projects: string[] = Array.isArray(args.project) ? args.project : [args.project];
							return projects.filter((p): p is BrowserType => p === 'chromium' || p === 'firefox' || p === 'webkit');
						}

						const config = await findPlaywrightConfig(extension.getPath(), Environment.getRoot());
						return getBrowsersFromConfig(config);
					})();

					const browserLabels: Record<string, string> = {
						chromium: 'Chromium',
						firefox: 'Firefox',
						webkit: 'WebKit',
					};

					const browserPromises = browsers.map(async (browserType) => {
						const label = browserLabels[browserType] ?? browserType;

						const result = await extension.runUnitTests({
							...args,
							browserType,
							onToken: (token) => reporter.handleToken(token, label),
						});

						if (result.debugCleanup)
						{
							await result.debugCleanup();
						}
					});

					await Promise.all(browserPromises);
				}

				if (type !== 'unit')
				{
					await extension.runEndToEndTests({
						...args,
						onToken: (token, browser) => reporter.handleToken(token, browser),
					});
				}
			});
		})
		.on('done', async () => {
			await queue.onIdle();

			reporter.finish();

			await new Promise<void>((resolve) => {
				process.stdout.write('', () => resolve());
			});
		})
		.on('error', (err: Error) => {
			console.log(formatInternalError({ code: CF.PACKAGE_READ_ERROR, message: err.message, stack: err.stack }));
			process.exit(1);
		});
}

function createTestTasks(extension: BasePackage, args: Record<string, any>, type?: 'unit' | 'e2e'): Task[]
{
	return [
		...(type !== 'e2e' ? [runUnitTestsTask(extension, args)] : []),
		...(type !== 'unit' ? [runEndToEndTestsTask(extension, args)] : []),
	];
}

async function runTestsJson({ extensions, args, type }: RunTestsOptions): Promise<void>
{
	if (args.watch)
	{
		emitJson({
			success: false,
			command: 'test',
			error: { code: CF.OPTION_DENIED, message: '--watch is not supported with --reporter json' },
			extensions: [],
			summary: {
				total: 0, passed: 0, failed: 0, durationMs: 0,
				errorCount: 1, warningCount: 0,
				tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
			},
		});
		process.exit(2);
	}

	const result = await testJson({
		extension: extensions.length > 0 ? extensions : undefined,
		path: extensions.length > 0 ? undefined : args.path,
		kind: type ?? 'all',
		headed: args.headed,
		debug: args.debug,
		grep: args.grep,
		file: args.file,
		project: args.project,
	});
	emitJson(result);
	process.exit(result.success ? 0 : 1);
}

function runTests({ extensions, args, type }: RunTestsOptions): void
{
	if (args.reporter === 'json')
	{
		void runTestsJson({ extensions, args, type });
		return;
	}

	if (args.reporter === 'teamcity')
	{
		return runTestsTeamcity({ extensions, args, type });
	}

	const queue = new SequentialQueue();
	const extensionsStream = createExtensionsStream(extensions, args);

	const testResults: TaskGroupResult[] = [];
	const startTime = Date.now();
	const watchers: Array<FSWatcher> = [];

	extensionsStream
		.on('not-found', ({ message }: { message: string }) => {
			console.log('');
			console.log(message);
		})
		.on('data', async ({ extension, explicit }: { extension: BasePackage; explicit: boolean }) => {
			if (!explicit && !(await hasTestsForType(extension, type)))
			{
				return;
			}

			const tasks = createTestTasks(extension, args, type);

			await queue.add(async () => {
				const result = await TaskRunner.run({
					title: extension.getName(),
					tasks,
					showSummary: false,
					suppressErrorDetails: true,
				});
				testResults.push(result);
			});

			if (args.watch)
			{
				await queue.add(async () => {
					const name = extension.getName();
					const chokidar = await import('chokidar');
					const watchDirs = [
						extension.getSourceDirectoryPath(),
						...(type !== 'e2e' ? [extension.getUnitTestsDirectoryPath()] : []),
						...(type !== 'unit' ? [extension.getEndToEndTestsDirectoryPath()] : []),
					];
					const watcher = chokidar.watch(watchDirs, {
						ignoreInitial: true,
						ignored: ['**/*.map', '**/dist/**'],
					});

					watchers.push(watcher);

					let running = false;
					let pendingRerun = false;
					let debounceTimer: ReturnType<typeof setTimeout> | null = null;

					const rerun = async () => {
						running = true;
						PlaywrightUnitStrategy.clearBundleCache();
						const freshTasks = createTestTasks(extension, args, type);
						await TaskRunner.run({
							title: name,
							tasks: freshTasks,
							showSummary: false,
							suppressErrorDetails: true,
						});
						running = false;

						if (pendingRerun)
						{
							pendingRerun = false;
							rerun();
						}
					};

					watcher.on('change', () => {
						if (debounceTimer)
						{
							clearTimeout(debounceTimer);
						}

						debounceTimer = setTimeout(() => {
							debounceTimer = null;

							if (running)
							{
								pendingRerun = true;
								return;
							}

							rerun();
						}, 300);
					});
				});
			}
		})
		.on('done', async ({ count }) => {
			await queue.onIdle();

			if (args.watch)
			{
				if (count === 1)
				{
					console.log(`\n${chalk.green('✔')} Watcher started`);
				}
				else
				{
					console.log(`\n${chalk.green('✔')} Watcher started for ${count} extensions`);
				}
			}
			else
			{
				printSummary(testResults, startTime, { isTestRun: true });

				process.exit(0);
			}
		})
		.on('error', (err: Error) => {
			console.log(formatInternalError({ code: CF.PACKAGE_READ_ERROR, message: err.message, stack: err.stack }));
			process.exit(1);
		});

	if (args.watch)
	{
		const shutdown = createShutdown(async () => {
			console.log('\nWatcher stopped...');

			for await (const watcher of watchers)
			{
				await watcher.close();
			}

			await queue.onIdle();

			console.log('Goodbye!');
		});

		process.on('SIGINT', shutdown);
		process.on('SIGTERM', shutdown);
		if (process.platform !== 'win32')
		{
			process.on('SIGTSTP', shutdown);
		}
	}
}

const commonOptions = (cmd: Command) => cmd
	.option('-w, --watch', 'Watch files and rerun tests on changes')
	.option('-p, --path [path]', 'Search for extensions and tests starting from this directory', preparePath, process.cwd())
	.option('--headed', 'Run browser tests in headed mode')
	.option('--debug', 'Run tests in debug mode (slower, more logs)')
	.option('--grep <pattern>', 'Run only tests that match the given pattern')
	.option('--project <projects...>', 'Run tests in the specified Playwright projects')
	.addOption(createReporterOption(['default', 'json', 'teamcity']))
	.option('--console', 'Print captured browser console output for each extension')
	.option('--cdp-port <port>', 'Launch browser with Chrome DevTools Protocol on this port', parseInt);

export const testCommand = new Command('test');

testCommand
	.description('Run unit and end-to-end tests for extensions')
	.argument('[extensions...]', 'Extensions to test (e.g. main.core ui.buttons)');

commonOptions(testCommand)
	.action((extensions: string[], _opts, command: Command): void => {
		runTests({ extensions, args: command.optsWithGlobals() });
	});

function splitExtensionsAndFile(args: string[]): { extensions: string[]; file?: string }
{
	if (args.length === 0)
	{
		return { extensions: [] };
	}

	const last = args[args.length - 1];
	const isFile = /\.(test|spec)\.(ts|js)$/.test(last) || /\.(test|spec)$/.test(last);
	if (isFile)
	{
		return { extensions: args.slice(0, -1), file: last };
	}

	return { extensions: args };
}

const unitCommand = new Command('unit')
	.description('Run only unit tests')
	.argument('[args...]', 'Extensions to test and optionally a test file (e.g. main.core ui.buttons dom.test.ts)');

commonOptions(unitCommand)
	.action((rawArgs: string[], _opts, command: Command): void => {
		const args = command.optsWithGlobals();
		const { extensions, file } = splitExtensionsAndFile(rawArgs);
		runTests({ extensions, args: { ...args, file }, type: 'unit' });
	});

const e2eCommand = new Command('e2e')
	.description('Run only e2e tests')
	.argument('[args...]', 'Extensions to test and optionally a test file (e.g. main.core ui.buttons button.spec.ts)');

commonOptions(e2eCommand)
	.action((rawArgs: string[], _opts, command: Command): void => {
		const args = command.optsWithGlobals();
		const { extensions, file } = splitExtensionsAndFile(rawArgs);
		runTests({ extensions, args: { ...args, file }, type: 'e2e' });
	});

testCommand
	.addCommand(unitCommand)
	.addCommand(e2eCommand);
