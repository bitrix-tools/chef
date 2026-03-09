import * as path from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import PQueue from 'p-queue';

import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { findPackages } from '../../utils/package/find-packages';
import { createPathOption } from '../../shared/options/path-option';
import { TaskContext, TaskRunner } from '../../modules/task/task';

import type { BasePackage } from '../../modules/packages/base-package';

export const flowToTsCommand = new Command('flow-to-ts');

flowToTsCommand
	.description('Migrate Flow-typed JS code to TypeScript in extensions')
	.addOption(createPathOption('Start searching for bundle.config.* and Flow sources from this directory'))
	.option('--rm-ts', 'Remove existing .ts sources after migration', false)
	.option('--rm-js', 'Remove original .js sources after migration', false)
	.action((args): void => {
		const queue = new PQueue({ concurrency: 1 });

		const packageFactory = PackageFactoryProvider.create();
		const extensionsStream: NodeJS.ReadableStream = findPackages({
			startDirectory: args.path,
			packageFactory,
		});

		extensionsStream
			.on('data', async ({ extension }: { extension: BasePackage }) => {
				void queue.add(async () => {
					const sourceFiles = extension.getActualSourceFiles();
					if (sourceFiles.length === 0)
					{
						console.log('Source JS files don\'t exist.');
					}

					const migrator = await extension.createMigrator();

					await TaskRunner.run([
						{
							title: chalk.bold(`Migrate ${extension.getName()} to TypeScript`),
							run: async () => {
								return Promise.resolve();
							},
							subtasks: [
								{
									title: 'Rename source files with `hg rename`',
									run: async () => {
										return Promise.resolve();
									},
									subtasks: sourceFiles.map((filePath: string) => {
										const relativeJsPath = path.relative(extension.getPath(), filePath);
										const relativeTsPath = relativeJsPath.replace(/\.js$/, '.ts');

										return {
											title: `Rename file: ${relativeJsPath} ...`,
											run: async (context: TaskContext): Promise<void> => {
												const result = await migrator.renameFile(filePath);

												if (result.success)
												{
													context.succeed(`File renamed: ${relativeJsPath} --> ${relativeTsPath}`);
												}
												else
												{
													context.fail(`Rename failed: ${relativeJsPath}`);
												}
											},
										};
									}),
								},
								{
									title: 'Convert Flow.js syntax to TypeScript syntax',
									run: async () => {
										return Promise.resolve();
									},
									subtasks: sourceFiles.map((filePath: string) => {
										const tsPath = filePath.replace(/\.js$/, '.ts');
										const relativeTsPath = path.relative(extension.getPath(), tsPath);

										return {
											title: `Convert file: ${relativeTsPath} ...`,
											run: async (context: TaskContext): Promise<void> => {
												const result = await migrator.convertFile(tsPath);

												if (result.success)
												{
													context.succeed(`File converted: ${relativeTsPath}`);
												}
												else
												{
													context.fail(`Conversion failed: ${relativeTsPath}`);
												}
											},
										};
									}),
								},
								{
									title: 'Update bundle.config.js',
									run: async () => {
										return Promise.resolve();
									},
									subtasks: [
										{
											title: 'Change entry point...',
											run: async (context: TaskContext) => {
												const updated = await migrator.updateBundleConfigEntryPoint();

												if (updated)
												{
													const bundleConfig = extension.getBundleConfig();
													context.succeed(`Entry point changed to ${bundleConfig.get('input')}`);
												}
												else
												{
													context.warn('Entry point not set');
												}
											},
										},
										{
											title: 'Rename bundle.config.js...',
											run: async (context: TaskContext) => {
												const renamed = await migrator.renameBundleConfig();

												if (renamed)
												{
													context.succeed(`Bundle config renamed to bundle.config${chalk.bold.green('.ts')}`);
												}
												else
												{
													context.fail(`Rename failed: ${extension.getBundleConfigJsFilePath()}`);
												}
											},
										},
									],
								},
							],
						}
					]);
				});
			})
			.on('done', async () => {
				await queue.onIdle();
				process.exit(0);
			})
			.on('error', (err: Error) => {
				console.error('❌ Error while reading packages:', err);
				process.exit(1);
			});
	});
