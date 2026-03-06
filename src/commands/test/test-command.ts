import chalk from 'chalk';
import { Command } from 'commander';
import { preparePath } from '../../utils/cli/prepare-path';
import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { PackageResolver } from '../../modules/packages/package.resolver';
import { findPackages } from '../../utils/package/find-packages';
import { createShutdown } from '../../utils/create.shutdown';
import { testQueue } from './queue/test-queue';
import { TaskRunner } from '../../modules/task/task';
import { runUnitTestsTask } from './tasks/run.unit.tests.task';
import { runEndToEndTestsTask } from './tasks/run.e2e.tests.task';

import type { BasePackage } from '../../modules/packages/base-package';
import type { FSWatcher } from 'chokidar';

type RunTestsOptions = {
	extensions: string[];
	args: Record<string, any>;
	type?: 'unit' | 'e2e';
};

function runTests({ extensions, args, type }: RunTestsOptions): void
{
	const extensionsStream: NodeJS.ReadableStream = (() => {
		if (extensions.length > 0)
		{
			return PackageResolver.resolveStream(extensions);
		}

		const packageFactory = PackageFactoryProvider.create();
		return findPackages({
			startDirectory: args.path,
			packageFactory,
		});
	})();

	const watchers: Array<FSWatcher> = [];

	extensionsStream
		.on('data', async ({ extension }: { extension: BasePackage }) => {
			const subtasks = [
				...(type !== 'e2e' ? [runUnitTestsTask(extension, args)] : []),
				...(type !== 'unit' ? [runEndToEndTestsTask(extension, args)] : []),
			];

			await testQueue.add(async () => {
				const name = extension.getName();
				await TaskRunner.run([
					{
						title: chalk.bold(name),
						run: () => {
							return Promise.resolve();
						},
						subtasks,
					},
				]);
			});

			if (args.watch)
			{
				await testQueue.add(async () => {
					const name = extension.getName();
					const chokidar = await import('chokidar');
					const watchDirs = [
						...(type !== 'e2e' ? [extension.getUnitTestsDirectoryPath()] : []),
						...(type !== 'unit' ? [extension.getEndToEndTestsDirectoryPath()] : []),
					];
					const watcher = chokidar.watch(watchDirs);

					watchers.push(watcher);

					watcher.on('change', async () => {
						await testQueue.add(async () => {
							await TaskRunner.run([
								{
									title: chalk.bold(name),
									run: () => {
										return Promise.resolve();
									},
									subtasks,
								},
							]);
						});
					});
				});
			}
		})
		.on('done', async ({ count }) => {
			await testQueue.onIdle();

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
			console.error('❌ Error while reading packages:', err);
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

			await testQueue.onIdle();

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
	.option('--project <projects...>', 'Run tests in the specified Playwright projects');

export const testCommand = new Command('test');

testCommand
	.description('Run unit and end-to-end tests for extensions')
	.argument('[extensions...]', 'Extensions to test (e.g. main.core ui.buttons)');

commonOptions(testCommand)
	.action((extensions: string[], args): void => {
		runTests({ extensions, args });
	});

// Splits [extensions..., file?] — file is the last arg if it looks like a filename (contains a dot and no dot-separated segments > 2 chars each)
function splitExtensionsAndFile(args: string[]): { extensions: string[]; file?: string }
{
	if (args.length === 0)
	{
		return { extensions: [] };
	}

	const last = args[args.length - 1];
	// A test file pattern contains a dot followed by common test extensions
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
	.action((rawArgs: string[], args): void => {
		const { extensions, file } = splitExtensionsAndFile(rawArgs);
		runTests({ extensions, args: { ...args, file }, type: 'unit' });
	});

const e2eCommand = new Command('e2e')
	.description('Run only e2e tests')
	.argument('[args...]', 'Extensions to test and optionally a test file (e.g. main.core ui.buttons button.spec.ts)');

commonOptions(e2eCommand)
	.action((rawArgs: string[], args): void => {
		const { extensions, file } = splitExtensionsAndFile(rawArgs);
		runTests({ extensions, args: { ...args, file }, type: 'e2e' });
	});

testCommand
	.addCommand(unitCommand)
	.addCommand(e2eCommand);
