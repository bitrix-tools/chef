import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { Command } from 'commander';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';

import { createPathOption } from '../../shared/options/path-option';
import { PackageCreator } from '../../modules/services/package-creator';

export const createCommand = new Command('create');

createCommand
	.description('Create a new Bitrix JS extension scaffold')
	.argument('<name>', 'Extension name (e.g. ui.buttons)')
	.option('-t, --tech [tech]', 'Source language: "ts" (default) or "js"')
	.option('-f, --force', 'Overwrite existing directory without asking')
	.addOption(createPathOption('Root directory where the extension will be created'))
	.action(async (extensionName, args) => {
		const creator = new PackageCreator(path.join(import.meta.dirname, 'templates'));
		const packagePath = creator.resolvePackagePath(extensionName);

		const isDirectoryExists = await (async () => {
			try
			{
				return (await fs.lstat(packagePath)).isDirectory();
			}
			catch
			{
				return false;
			}
		})();

		if (isDirectoryExists && !args.force)
		{
			const isProceed = await confirm({
				message: `The directory '${packagePath}' already exists. Continue?`,
				default: false,
			});

			if (!isProceed)
			{
				console.log(`${extensionName} create canceled`);
				return;
			}
		}

		const result = await creator.create({
			extensionName,
			tech: args.tech,
		});

		console.log(`${chalk.green('✔')} ${extensionName} created successfully`);
		console.log(`  file://${result.packagePath}`);
	});
