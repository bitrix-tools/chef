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
import { formatInternalError } from '../../diagnostics/format-error';
import { CF } from '../../diagnostics/diagnostic-codes';

import type { BasePackage } from '../../modules/packages/base-package';
import type { Task } from '../../modules/task/task-types';
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

function runTestsTeamcity({ extensions, args, type }: RunTestsOptions): void
{
	const queue = new SequentialQueue();
	const extensionsStream = createExtensionsStream(extensions, args);
	const reporter = new TeamcityReporter();

	extensionsStream
		.on('data', async ({ extension }: { extension: BasePackage }) => {
			await queue.add(async () => {
				if (type !== 'e2e')
				{
					const browsers = (() => {
						if (args.project)
						{
							const projects: string[] = Array.isArray(args.project) ? args.project : [args.project];
							return projects.filter(Boolean);
						}

						return ['chromium', 'firefox', 'webkit'];
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

function runTests({ extensions, args, type }: RunTestsOptions): void
{
	if (args.reporter === 'teamcity')
	{
		return runTestsTeamcity({ extensions, args, type });
	}

	const queue = new SequentialQueue();
	const extensionsStream = createExtensionsStream(extensions, args);

	const watchers: Array<FSWatcher> = [];

	extensionsStream
		.on('data', async ({ extension }: { extension: BasePackage }) => {
			const tasks = createTestTasks(extension, args, type);

			await queue.add(async () => {
				await TaskRunner.run({
					title: extension.getName(),
					tasks,
				});
			});

			if (args.watch)
			{
				await queue.add(async () => {
					const name = extension.getName();
					const chokidar = await import('chokidar');
					const watchDirs = [
						...(type !== 'e2e' ? [extension.getUnitTestsDirectoryPath()] : []),
						...(type !== 'unit' ? [extension.getEndToEndTestsDirectoryPath()] : []),
					];
					const watcher = chokidar.watch(watchDirs);

					watchers.push(watcher);

					watcher.on('change', async () => {
						await queue.add(async () => {
							const freshTasks = createTestTasks(extension, args, type);
							await TaskRunner.run({
								title: name,
								tasks: freshTasks,
							});
						});
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
				if (count > 1)
				{
					console.log(`\n${chalk.green('✔')} Test ${count} extensions successfully`);
				}

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
			console.log('\n🛑 Watcher stopped...');

			for await (const watcher of watchers)
			{
				await watcher.close();
			}

			await queue.onIdle();

			console.log('👋 Goodbye!');
		});

		process.on('SIGINT', shutdown);
		process.on('SIGTERM', shutdown);
		process.on('SIGTSTP', shutdown);
	}
}

const commonOptions = (cmd: Command) => cmd
	.option('-w, --watch', 'Watch files and rerun tests on changes')
	.option('-p, --path [path]', 'Search for extensions and tests starting from this directory', preparePath, process.cwd())
	.option('--headed', 'Run browser tests in headed mode')
	.option('--debug', 'Run tests in debug mode (slower, more logs)')
	.option('--grep <pattern>', 'Run only tests that match the given pattern')
	.option('--project <projects...>', 'Run tests in the specified Playwright projects')
	.option('--reporter <type>', 'Reporter to use: default, teamcity', 'default')
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
