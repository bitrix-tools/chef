import * as path from 'node:path';
import fs from 'node:fs';

import { Command, Option } from 'commander';
import chalk from 'chalk';

import { SequentialQueue } from '../../utils/sequential-queue';
import { createPathOption } from '../../shared/options/path-option';
import { PackageResolver } from '../../modules/packages/package-resolver';
import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { findPackages } from '../../utils/package/find-packages';
import { formatInternalError } from '../../diagnostics/format-error';
import { CF } from '../../diagnostics/diagnostic-codes';
import { TaskRunner } from '../../modules/task/task-runner';
import { FileFinder } from '../../utils/file-finder';
import { Environment } from '../../environment/environment';
import { loadTsConfig } from '../../utils/load-tsconfig';
import { checkTypes } from '../../modules/engines/build/rollup/plugins/typescript';
import { typecheck as typecheckApi } from '../../api/typecheck';
import { emitJson, isJsonMode } from '../../api/json-output';

import type { BasePackage } from '../../modules/packages/base-package';
import type { Task, TaskResult, TaskDetail } from '../../modules/task/task-types';

type TypecheckOptions = {
	files?: string[];
	exclude?: string[];
};

function createTypecheckTask(extension: BasePackage, options: TypecheckOptions): Task
{
	const name = extension.getName();

	return {
		title: `Checking ${name}...`,
		async run(): Promise<TaskResult>
		{
			if (!extension.isTypeScriptMode())
			{
				return {
					title: chalk.bold(name),
					status: 'skipped',
					details: [{ type: 'item', text: 'Not a TypeScript extension' }],
				};
			}

			const inputPath = extension.getInputPath();
			const packageRoot = extension.getPath();

			const tsConfigPath = FileFinder.findUpFile({
				fileName: 'tsconfig.json',
				fromDir: path.dirname(inputPath),
				rootDir: Environment.getRoot() ?? undefined,
			});

			let compilerOptions: import('typescript').CompilerOptions | undefined;
			if (typeof tsConfigPath === 'string' && tsConfigPath.length > 0)
			{
				const tsConfig = await loadTsConfig(tsConfigPath, packageRoot);
				compilerOptions = tsConfig.options;
			}

			const files = options.files?.map((pattern) => {
				return path.isAbsolute(pattern) ? pattern : path.join(packageRoot, pattern);
			});
			const exclude = options.exclude?.map((pattern) => {
				return path.isAbsolute(pattern) ? pattern : path.join(packageRoot, pattern);
			});

			if (files)
			{
				const notFound = files.filter((f) => !fs.existsSync(f));
				if (notFound.length > 0)
				{
					return {
						title: chalk.bold(name),
						status: 'failed',
						details: notFound.map((f) => ({
							type: 'error' as const,
							code: CF.NOT_FOUND,
							message: `File not found: ${path.relative(packageRoot, f)}`,
						})),
					};
				}
			}

			const result = await checkTypes({
				packageRoot,
				compilerOptions,
				files,
				exclude: [
					extension.getOutputJsPath(),
					extension.getOutputCssPath(),
					...(exclude ?? []),
				],
			});

			if (result.errors.length > 0)
			{
				const root = extension.getPath();
				const relativeRoot = path.relative(process.cwd(), root);
				const pathPrefix = relativeRoot ? relativeRoot + '/' : '';

				const details: TaskDetail[] = result.errors.map((error) => ({
					type: 'error' as const,
					code: error.code,
					message: error.message.replaceAll(pathPrefix, ''),
					frame: error.frame,
					loc: error.loc?.file
						? { file: error.loc.file, line: error.loc.line, column: error.loc.column, root }
						: undefined,
				}));

				return {
					title: chalk.bold(name),
					status: 'failed',
					details,
				};
			}

			return {
				title: chalk.bold(name),
				status: 'passed',
			};
		},
	};
}

const typecheckCommand = new Command('typecheck');

typecheckCommand
	.description('Check TypeScript types in extensions')
	.argument('[extensions...]', 'Extensions to check (e.g. main.core ui.buttons)')
	.addOption(createPathOption('Search for extensions starting from this directory'))
	.addOption(new Option('--file <patterns...>', 'Check specific files (paths relative to extension root)'))
	.addOption(new Option('--exclude <patterns...>', 'Exclude files from type checking (paths relative to extension root)'))
	.action(async (extensions: string[], args) => {
		if (isJsonMode())
		{
			const result = await typecheckApi({
				extension: extensions,
				path: args.path,
				files: args.file,
				exclude: args.exclude,
			});
			emitJson(result);
			process.exit(result.ok ? 0 : 1);
		}

		const queue = new SequentialQueue();
		const results: TaskResult[] = [];
		const startTime = Date.now();

		const typecheckOptions: TypecheckOptions = {
			files: args.file,
			exclude: args.exclude,
		};

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

		extensionsStream
			.on('not-found', ({ message }: { message: string }) => {
				console.log('');
				console.log(message);
			})
			.on('data', ({ extension }: { extension: BasePackage }) => {
				queue.add(async () => {
					const result = await TaskRunner.run({
						title: extension.getName(),
						tasks: [createTypecheckTask(extension, typecheckOptions)],
					});

					results.push(...result.results);
				});
			})
			.on('done', async () => {
				await queue.onIdle();

				const checked = results.filter((r) => r.status !== 'skipped');

				if (checked.length > 1)
				{
					const passed = checked.filter((r) => r.status === 'passed').length;
					const failed = checked.filter((r) => r.status === 'failed').length;

					const LABEL_WIDTH = 12;
					console.log('');
					console.log(`   ${chalk.gray('-'.repeat(60))}`);

					const summaryParts: string[] = [];
					if (passed > 0)
					{
						summaryParts.push(chalk.green.bold(`${passed} passed`));
					}
					if (failed > 0)
					{
						summaryParts.push(chalk.red.bold(`${failed} failed`));
					}

					console.log(`   ${chalk.bold('Extensions'.padEnd(LABEL_WIDTH))}${summaryParts.join(chalk.gray(' | '))} ${chalk.gray(`(${checked.length})`)}`);

					const duration = ((Date.now() - startTime) / 1000).toFixed(2);
					console.log(`   ${chalk.bold('Time'.padEnd(LABEL_WIDTH))}${duration}s`);
				}

				console.log('');

				const hasFailed = results.some((r) => r.status === 'failed');
				process.exit(hasFailed ? 1 : 0);
			})
			.on('error', (err: Error) => {
				console.log(formatInternalError({ code: CF.PACKAGE_READ_ERROR, message: err.message, stack: err.stack }));
				process.exit(1);
			});
	});

export {
	typecheckCommand,
};
