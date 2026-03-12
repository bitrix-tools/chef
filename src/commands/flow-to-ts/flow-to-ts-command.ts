import * as path from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import { SequentialQueue } from '../../utils/sequential-queue';

import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { PackageResolver } from '../../modules/packages/package-resolver';
import { findPackages } from '../../utils/package/find-packages';
import { createPathOption } from '../../shared/options/path-option';
import { TaskRunner } from '../../modules/task/task-runner';
import { formatInternalError } from '../../diagnostics/format-error';
import { CF } from '../../diagnostics/diagnostic-codes';

import type { BasePackage } from '../../modules/packages/base-package';
import type { Task, TaskResult } from '../../modules/task/task-types';

export const flowToTsCommand = new Command('flow-to-ts');

flowToTsCommand
	.description('Migrate Flow-typed JS code to TypeScript in extensions')
	.argument('[extensions...]', 'Extensions to migrate (e.g. main.core ui.buttons)')
	.addOption(createPathOption('Start searching for bundle.config.* and Flow sources from this directory'))
	.option('--rm-ts', 'Remove existing .ts sources after migration', false)
	.option('--rm-js', 'Remove original .js sources after migration', false)
	.action((extensions: string[], args): void => {
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
			});
		})();

		extensionsStream
			.on('data', async ({ extension }: { extension: BasePackage }) => {
				void queue.add(async () => {
					const sourceFiles = extension.getActualSourceFiles();
					if (sourceFiles.length === 0)
					{
						console.log('Source JS files don\'t exist.');
					}

					const migrator = await extension.createMigrator();

					const renameTasks: Task[] = sourceFiles.map((filePath: string) => {
						const relativeJsPath = path.relative(extension.getPath(), filePath);
						const relativeTsPath = relativeJsPath.replace(/\.js$/, '.ts');

						return {
							title: `Rename file: ${relativeJsPath} ...`,
							run: async (): Promise<TaskResult> => {
								const result = await migrator.renameFile(filePath);

								return {
									title: result.success
										? `File renamed: ${relativeJsPath} --> ${relativeTsPath}`
										: `Rename failed: ${relativeJsPath}`,
									status: result.success ? 'passed' : 'failed',
								};
							},
						};
					});

					const convertTasks: Task[] = sourceFiles.map((filePath: string) => {
						const tsPath = filePath.replace(/\.js$/, '.ts');
						const relativeTsPath = path.relative(extension.getPath(), tsPath);

						return {
							title: `Convert file: ${relativeTsPath} ...`,
							run: async (): Promise<TaskResult> => {
								const result = await migrator.convertFile(tsPath);

								return {
									title: result.success
										? `File converted: ${relativeTsPath}`
										: `Conversion failed: ${relativeTsPath}`,
									status: result.success ? 'passed' : 'failed',
								};
							},
						};
					});

					const configTasks: Task[] = [
						{
							title: 'Change entry point...',
							run: async (): Promise<TaskResult> => {
								const updated = await migrator.updateBundleConfigEntryPoint();

								if (updated)
								{
									const bundleConfig = extension.getBundleConfig();

									return {
										title: `Entry point changed to ${bundleConfig.get('input')}`,
										status: 'passed',
									};
								}

								return {
									title: 'Entry point not set',
									status: 'warning',
								};
							},
						},
						{
							title: 'Rename bundle.config.js...',
							run: async (): Promise<TaskResult> => {
								const renamed = await migrator.renameBundleConfig();

								return {
									title: renamed
										? `Bundle config renamed to bundle.config${chalk.bold.green('.ts')}`
										: `Rename failed: ${extension.getBundleConfigJsFilePath()}`,
									status: renamed ? 'passed' : 'failed',
								};
							},
						},
					];

					await TaskRunner.run({
						title: `Migrate ${extension.getName()} to TypeScript`,
						tasks: [
							...renameTasks,
							...convertTasks,
							...configTasks,
						],
					});
				});
			})
			.on('done', async () => {
				await queue.onIdle();
				process.exit(0);
			})
			.on('error', (err: Error) => {
				console.log(formatInternalError({ code: CF.PACKAGE_READ_ERROR, message: err.message, stack: err.stack }));
				process.exit(1);
			});
	});
