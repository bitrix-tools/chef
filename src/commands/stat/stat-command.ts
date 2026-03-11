import { Command } from 'commander';
import PQueue from 'p-queue';
import chalk from 'chalk';

import { createPathOption } from '../../shared/options/path-option';
import { findPackages } from '../../utils/package/find-packages';
import { PackageFactory } from '../../modules/packages/package-factory';
import { PackageResolver } from '../../modules/packages/package-resolver';
import { Environment } from '../../environment/environment';
import { sourceStrategies } from '../../modules/packages/strategies/source';
import { projectStrategies } from '../../modules/packages/strategies/project';
import { defaultStrategy } from '../../modules/packages/strategies/default-strategy';
import { TaskRunner } from '../../modules/task/task';
import { directDependenciesTask } from '../../shared/tasks/direct-dependencies-task';
import { dependenciesTreeTask } from '../../shared/tasks/dependencies-tree-task';
import { circularDependenciesTask } from './tasks/circular-dependencies-task';
import { bundleSizeTask } from '../../shared/tasks/bundle-size-task';
import { totalTransferredSizeTask } from '../../shared/tasks/total-transferred-size-task';
import { unitTestsTask } from './tasks/unit-tests-task';
import { e2eTestsTask } from './tasks/e2e-tests-task';
import { tryBuildTask } from './tasks/try-build-task';
import { lintTask } from '../../shared/tasks/lint-task';

const statCommand = new Command('stat');

statCommand
	.description('Show build, tests and bundle statistics for Bitrix extensions')
	.argument('[extensions...]', 'Extensions to analyze (e.g. main.core ui.buttons)')
	.addOption(createPathOption('Scan for extensions and stats starting from this directory'))
	.action(async (extensions: string[], args) => {
		const queue = new PQueue({ concurrency: 1 });

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
				queue.add(async () => {
					const name = extension.getName();

					await TaskRunner.run([
						{
							title: chalk.bold(name),
							run: () => {
								return Promise.resolve();
							},
							subtasks: [
								lintTask(extension),
								tryBuildTask(extension),
								unitTestsTask(extension),
								e2eTestsTask(extension),
								directDependenciesTask(extension, args),
								dependenciesTreeTask(extension, args),
								circularDependenciesTask(extension),
								bundleSizeTask(extension, args),
								totalTransferredSizeTask(extension),
							],
						},
					]);
				});
			})
			.on('done', async () => {
				await queue.onIdle();
				process.exit(0);
			});
	});

export {
	statCommand,
};
