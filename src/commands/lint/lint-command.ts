import { Command, Option } from 'commander';
import chalk from 'chalk';

import { SequentialQueue } from '../../utils/sequential-queue';
import { createPathOption } from '../../shared/options/path-option';
import { PackageResolver } from '../../modules/packages/package-resolver';
import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { findPackages } from '../../utils/package/find-packages';
import { formatInternalError } from '../../diagnostics/format-error';
import { CF } from '../../diagnostics/diagnostic-codes';
import { lint } from './internal/lint';

import type { BasePackage } from '../../modules/packages/base-package';

const lintCommand = new Command('lint');

lintCommand
	.description('Run linting for Bitrix JS extensions')
	.argument('[extensions...]', 'Extensions to lint (e.g. main.core ui.buttons)')
	.addOption(createPathOption('Search for extensions and lint starting from this directory'))
	.addOption(new Option('--fix', 'Automatically fix problems'))
	.addOption(new Option('--file <patterns...>', 'Lint specific files (glob patterns relative to extension src/)'))
	.action(async (extensions: string[], args) => {
		const queue = new SequentialQueue();

		const lintOptions = {
			fix: args.fix ?? false,
			files: args.file,
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
			.on('data', ({ extension }: { extension: BasePackage }) => {
				queue.add(lint(extension, lintOptions));
			})
			.on('done', async ({ count }) => {
				await queue.onIdle();

				if (count > 1)
				{
					console.log(`\n${chalk.green('✔')} Linted ${count} extensions`);
				}

				process.exit(0);
			})
			.on('error', (err: Error) => {
				console.log(formatInternalError({ code: CF.PACKAGE_READ_ERROR, message: err.message, stack: err.stack }));
				process.exit(1);
			});
	});

export {
	lintCommand,
};
