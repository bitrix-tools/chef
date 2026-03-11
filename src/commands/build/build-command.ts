import { Command } from 'commander';
import chalk from 'chalk';
import PQueue from 'p-queue';

import { watchOption } from './options/watch-option';
import { createPathOption } from '../../shared/options/path-option';
import { verboseOption } from './options/verbose-option';
import { forceOption } from './options/force-option';
import { productionOption } from './options/production-option';
import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { PackageResolver } from '../../modules/packages/package-resolver';
import { findPackages } from '../../utils/package/find-packages';
import { createShutdown } from '../../utils/create-shutdown';
import { build } from './internal/build';

import type { FSWatcher } from 'chokidar';
import type { BasePackage } from '../../modules/packages/base-package';

const buildCommand = new Command('build');

buildCommand
	.description('Build JS extensions for Bitrix')
	.argument('[extensions...]', 'Extensions to build (e.g. main.core ui.buttons)')
	.addOption(watchOption)
	.addOption(createPathOption('Search for bundle.config.* and build extensions starting from this directory'))
	.addOption(verboseOption)
	.addOption(forceOption)
	.addOption(productionOption)
	.action(async (extensions: string[], args) => {
		const queue = new PQueue({ concurrency: 1 });

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

		const watchers: Array<FSWatcher> = [];
		const timers = new Map<string, NodeJS.Timeout>();

		extensionsStream
			.on('data', async ({ extension }: { extension: BasePackage }) => {
				const extensionId = extension.getName();

				await queue.add(
					build(extension, args),
				);

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

							const timer = setTimeout(() => {
								queue.add(
									build(extension, args),
								);
								timers.delete(extensionId);
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
					if (count > 1)
					{
						console.log(`\n${chalk.green('✔')} Build ${count} extensions successfully`);
					}

					process.exit(0);
				}
			})
			.on('error', (err) => {
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

				for (const timer of timers.values())
				{
					clearTimeout(timer);
				}

				await queue.onIdle();

				console.log('👋 Goodbye!');
			});

			process.on('SIGINT', shutdown);
			process.on('SIGTERM', shutdown);
			process.on('SIGTSTP', shutdown);
		}
	});

export {
	buildCommand,
};
