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

export const testCommand = new Command('test');

testCommand
	.description('Run unit and end-to-end tests for extensions')
	.argument('[extensions...]', 'Extensions to test (e.g. main.core ui.buttons)')
	.option('-w, --watch', 'Watch files and rerun tests on changes')
	.option('-p, --path [path]', 'Search for extensions and tests starting from this directory', preparePath, process.cwd())
	.option('--headed', 'Run browser tests in headed mode')
	.option('--debug', 'Run tests in debug mode (slower, more logs)')
	.option('--grep <pattern>', 'Run only tests that match the given pattern')
	.option('--project <projects...>', 'Run tests in the specified Playwright projects')
	.action((extensions: string[], args): void => {
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
				await testQueue.add(async () => {
					const name = extension.getName();
					await TaskRunner.run([
						{
							title: chalk.bold(name),
							run: () => {
								return Promise.resolve();
							},
							subtasks: [
								runUnitTestsTask(extension, args),
								runEndToEndTestsTask(extension, args),
							],
						},
					]);
				});

				if (args.watch)
				{
					await testQueue.add(async () => {
						const name = extension.getName();
						const chokidar = await import('chokidar');
						const watcher = chokidar.watch(
							[
								extension.getUnitTestsDirectoryPath(),
								extension.getEndToEndTestsDirectoryPath(),
							],
						);

						watchers.push(watcher);

						watcher.on('change', async () => {
							await testQueue.add(async () => {
								await TaskRunner.run([
									{
										title: chalk.bold(name),
										run: () => {
											return Promise.resolve();
										},
										subtasks: [
											runUnitTestsTask(extension, args),
											runEndToEndTestsTask(extension, args),
										],
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
	});
