import { Command } from 'commander';
import { pathOption } from './options/path-option';
import { statQueue } from './queue/stat-queue';
import { findPackages } from '../../utils/package/find-packages';
import { PackageFactory } from '../../modules/packages/package-factory';
import { PackageResolver } from '../../modules/packages/package.resolver';
import { Environment } from '../../environment/environment';
import { sourceStrategies } from '../../modules/packages/strategies/source';
import { projectStrategies } from '../../modules/packages/strategies/project';
import { defaultStrategy } from '../../modules/packages/strategies/default-strategy';
import { TaskRunner } from '../../modules/task/task';
import chalk from 'chalk';
import { directDependenciesTask } from './tasks/direct.dependencies.task';
import { dependenciesTreeTask } from './tasks/dependencies.tree.task';
import { bundleSizeTask } from './tasks/bundle.size.task';
import { totalTransferredSizeTask } from './tasks/total.transferred.size.task';
import { unitTestsTask } from './tasks/unit.tests.task';
import { e2eTestsTask } from './tasks/e2e.tests.task';
import { tryBuildTask } from './tasks/try.build.task';

const statCommand = new Command('stat');

statCommand
	.description('Show build, tests and bundle statistics for Bitrix extensions')
	.argument('[extensions...]', 'Extensions to analyze (e.g. main.core ui.buttons)')
	.addOption(pathOption)
	.action(async (extensions: string[], args) => {
		const extensionsStream: NodeJS.ReadableStream = (() => {
			if (extensions.length > 0)
			{
				return PackageResolver.resolveStream(extensions);
			}

			return findPackages({
				startDirectory: args.path,
				packageFactory: new PackageFactory({
					strategies: Environment.getType() === 'source' ? sourceStrategies : projectStrategies,
					defaultStrategy: defaultStrategy,
				})
			});
		})();

		extensionsStream
			.on('data', ({ extension }) => {
				statQueue.add(async () => {
					const name = extension.getName();

					await TaskRunner.run([
						{
							title: chalk.bold(name),
							run: () => {
								return Promise.resolve();
							},
							subtasks: [
								tryBuildTask(extension),
								unitTestsTask(extension),
								e2eTestsTask(extension),
								directDependenciesTask(extension, args),
								dependenciesTreeTask(extension, args),
								bundleSizeTask(extension, args),
								totalTransferredSizeTask(extension),
							],
						},
					]);
				});
			})
			.on('done', async () => {
				await statQueue.onIdle();
				process.exit(0);
			});
	});

export {
	statCommand,
};
