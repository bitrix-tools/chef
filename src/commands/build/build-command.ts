import { Command } from 'commander';
import chalk from 'chalk';
import { SequentialQueue } from '../../utils/sequential-queue';
import { MergeLock } from '../../utils/merge-lock';
import { printSummary } from '../../shared/print-summary';

import { watchOption } from './options/watch-option';
import { createPathOption } from '../../shared/options/path-option';
import { verboseOption } from './options/verbose-option';
import { forceOption } from './options/force-option';
import { productionOption, developmentOption } from './options/production-option';
import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { PackageResolver } from '../../modules/packages/package-resolver';
import { findPackages } from '../../utils/package/find-packages';
import { Environment } from '../../environment/environment';
import { createShutdown } from '../../utils/create-shutdown';
import { formatInternalError } from '../../diagnostics/format-error';
import { CF } from '../../diagnostics/diagnostic-codes';
import { build } from './internal/build';

import type { FSWatcher } from 'chokidar';
import type { BasePackage } from '../../modules/packages/base-package';
import type { TaskGroupResult } from '../../modules/task/task-types';

const buildCommand = new Command('build');

buildCommand
	.description('Build JS extensions for Bitrix')
	.argument('[extensions...]', 'Extensions to build (e.g. main.core ui.buttons)')
	.addOption(watchOption)
	.addOption(createPathOption('Search for bundle.config.* and build extensions starting from this directory'))
	.addOption(verboseOption)
	.addOption(forceOption)
	.addOption(productionOption)
	.addOption(developmentOption)
	.action(async (extensions: string[], args) => {
		if (args.production)
		{
			process.env.NODE_ENV = 'production';
		}
		else if (args.development)
		{
			process.env.NODE_ENV = 'development';
		}

		const queue = new SequentialQueue();

		const extensionsStream: NodeJS.ReadableStream = (() => {
			if (extensions.length > 0)
			{
				return PackageResolver.resolveStream(extensions);
			}

			const packageFactory = PackageFactoryProvider.create();
			return findPackages({
				startDirectory: args.path,
				packageFactory,
				skipProtected: true,
			});
		})();

		const buildResults: TaskGroupResult[] = [];
		const startTime = Date.now();
		const watchers: Array<FSWatcher> = [];
		const timers = new Map<string, NodeJS.Timeout>();
		const mergeLock = new MergeLock(Environment.getRoot());

		extensionsStream
			.on('data', async ({ extension }: { extension: BasePackage }) => {
				const extensionId = extension.getName();

				await queue.add(async () => {
					const result = await build(extension, args)();
					buildResults.push(result);
				});

				if (args.watch)
				{
					await queue.add(async () => {
						const chokidar = await import('chokidar');
						const watcher = chokidar.watch(
							extension.getSourceDirectoryPath(),
						);

						watchers.push(watcher);

						watcher.on('change', () => {
							const existingTimer = timers.get(extensionId);
							if (existingTimer)
							{
								clearTimeout(existingTimer);
							}

							const timer = setTimeout(async () => {
								timers.delete(extensionId);

								if (await mergeLock.isLocked())
								{
									return;
								}

								queue.add(
									build(extension, args),
								);
							}, 100);

							timers.set(extensionId, timer);
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
					printSummary(buildResults, startTime);

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

				for (const timer of timers.values())
				{
					clearTimeout(timer);
				}

				await queue.onIdle();

				console.log('Goodbye!');
			});

			process.on('SIGINT', shutdown);
			process.on('SIGTERM', shutdown);
			process.on('SIGTSTP', shutdown);
		}
	});

export {
	buildCommand,
};
