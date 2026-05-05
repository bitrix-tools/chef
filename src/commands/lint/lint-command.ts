import * as path from 'node:path';

import { Command, Option } from 'commander';
import chalk from 'chalk';

import { SequentialQueue } from '../../utils/sequential-queue';
import { createPathOption } from '../../shared/options/path-option';
import { PackageResolver } from '../../modules/packages/package-resolver';
import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { findPackages } from '../../utils/package/find-packages';
import { formatInternalError } from '../../diagnostics/format-error';
import { CF } from '../../diagnostics/diagnostic-codes';
import { pluralize } from '../../utils/pluralize';
import { lint } from './internal/lint';
import { lint as lintApi } from '../../api/lint';
import { emitJson, isJsonMode } from '../../api/json-output';

import type { BasePackage } from '../../modules/packages/base-package';
import type { LintRunResult } from './internal/lint';

type FileStats = { fileName: string; errors: number; warnings: number };
type ExtensionFiles = { name: string; files: FileStats[] };

function collectFileStats(results: LintRunResult[]): ExtensionFiles[]
{
	const extensions: ExtensionFiles[] = [];

	for (const { name, root, lintResult } of results)
	{
		const files: FileStats[] = [];

		for (const file of lintResult.files)
		{
			if (file.messages.length === 0)
			{
				continue;
			}

			files.push({
				fileName: path.relative(root, file.filePath),
				errors: file.messages.filter((m) => m.severity === 'error').length,
				warnings: file.messages.filter((m) => m.severity === 'warning').length,
			});
		}

		if (files.length > 0)
		{
			extensions.push({ name, files });
		}
	}

	return extensions;
}

function printSummary(results: LintRunResult[], startTime: number): void
{
	const totalErrors = results.reduce((sum, r) => sum + r.lintResult.getErrorsCount(), 0);
	const totalWarnings = results.reduce((sum, r) => sum + r.lintResult.getWarningsCount(), 0);

	if (totalErrors === 0 && totalWarnings === 0 && results.length <= 1)
	{
		return;
	}

	const LABEL_WIDTH = 12;
	const extensionFiles = collectFileStats(results);

	if (extensionFiles.length > 0)
	{
		const allFileNames = extensionFiles.flatMap((ext) => ext.files.map((f) => f.fileName));
		const maxPathLength = Math.max(...allFileNames.map((name) => name.length));
		const showExtensionName = extensionFiles.length > 1;

		console.log('');
		let isFirst = true;
		for (const { name, files } of extensionFiles)
		{
			if (showExtensionName)
			{
				if (!isFirst)
				{
					console.log('');
				}

				const label = isFirst ? chalk.bold('Files'.padEnd(LABEL_WIDTH)) : ' '.repeat(LABEL_WIDTH);
				console.log(`   ${label}${chalk.bold(name)}`);
				isFirst = false;
			}

			for (const { fileName, errors, warnings } of files)
			{
				const parts: string[] = [];
				if (errors > 0)
				{
					parts.push(chalk.red(pluralize(' error', errors)));
				}
				if (warnings > 0)
				{
					parts.push(chalk.yellow(pluralize(' warning', warnings)));
				}

				const paddedPath = fileName.padEnd(maxPathLength);
				const label = !showExtensionName && isFirst
					? chalk.bold('Files'.padEnd(LABEL_WIDTH))
					: ' '.repeat(LABEL_WIDTH);
				console.log(`   ${label}${chalk.dim(paddedPath)}  ${parts.join(chalk.gray(' · '))}`);
				isFirst = false;
			}
		}
	}

	console.log('');
	console.log(`   ${chalk.gray('-'.repeat(60))}`);

	if (results.length > 1)
	{
		const passed = results.filter((r) => !r.lintResult.skipped && !r.lintResult.hasErrors() && !r.lintResult.hasWarnings()).length;
		const failed = results.filter((r) => r.lintResult.hasErrors()).length;
		const warned = results.filter((r) => !r.lintResult.hasErrors() && r.lintResult.hasWarnings()).length;

		const summaryParts: string[] = [];
		if (passed > 0)
		{
			summaryParts.push(chalk.green.bold(`${passed} passed`));
		}
		if (failed > 0)
		{
			summaryParts.push(chalk.red.bold(`${failed} failed`));
		}
		if (warned > 0)
		{
			summaryParts.push(chalk.yellow(pluralize(' warning', warned)));
		}

		const total = passed + failed + warned;
		console.log(`   ${chalk.bold('Extensions'.padEnd(LABEL_WIDTH))}${summaryParts.join(chalk.gray(' | '))} ${chalk.gray(`(${total})`)}`);
	}

	const duration = ((Date.now() - startTime) / 1000).toFixed(2);
	console.log(`   ${chalk.bold('Time'.padEnd(LABEL_WIDTH))}${duration}s`);
}

const lintCommand = new Command('lint');

lintCommand
	.description('Run linting for Bitrix JS extensions')
	.argument('[extensions...]', 'Extensions to lint (e.g. main.core ui.buttons)')
	.addOption(createPathOption('Search for extensions and lint starting from this directory'))
	.addOption(new Option('--fix', 'Automatically fix problems'))
	.addOption(new Option('--file <patterns...>', 'Lint specific files (glob patterns relative to extension src/)'))
	.addOption(new Option('--exclude <patterns...>', 'Exclude files from linting (glob patterns relative to extension root)'))
	.addOption(new Option('--no-cache', 'Disable caching (cache is enabled by default)'))
	.action(async (extensions: string[], args) => {
		if (isJsonMode())
		{
			const result = await lintApi({
				extension: extensions,
				path: args.path,
				fix: args.fix,
				files: args.file,
				cache: args.cache,
				exclude: args.exclude,
			});
			emitJson(result);
			process.exit(result.ok ? 0 : 1);
		}

		const queue = new SequentialQueue();
		const lintResults: LintRunResult[] = [];
		const startTime = Date.now();

		const lintOptions = {
			fix: args.fix ?? false,
			files: args.file,
			cache: args.cache,
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
					const result = await lint(extension, lintOptions)();
					lintResults.push(result);
				});
			})
			.on('done', async () => {
				await queue.onIdle();

				printSummary(lintResults, startTime);
				console.log('');

				const hasFailed = lintResults.some((r) => r.lintResult.hasErrors());
				process.exit(hasFailed ? 1 : 0);
			})
			.on('error', (err: Error) => {
				console.log(formatInternalError({ code: CF.PACKAGE_READ_ERROR, message: err.message, stack: err.stack }));
				process.exit(1);
			});
	});

export {
	lintCommand,
};
