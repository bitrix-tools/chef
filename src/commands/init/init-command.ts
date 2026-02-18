import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ora from 'ora';

import { Environment } from '../../environment/environment';
import { pathOption } from './options/path-option';
import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { findPackages } from '../../utils/package/find-packages';
import { FlexibleCompilerOptions } from '@rollup/plugin-typescript';
import type { BasePackage } from '../../modules/packages/base-package';

const initTestsCommand = new Command('tests')
	.description('Initialize tests environment')
	.addOption(pathOption)
	.action(async (subcommand, args) => {
		console.log('Preparing TypeScript environment');
		const spinner = ora('Generate configuration files').start();
		const playwrightConfigPath = path.join(__dirname, 'templates', 'playwright.config.ts.txt');
		const playwrightConfigContent = await fs.readFile(playwrightConfigPath, 'utf8');

		await fs.writeFile(
			path.join(Environment.getRoot(), 'playwright.config.ts'),
			playwrightConfigContent,
		);

		const dotEnvTestPath = path.join(__dirname, 'templates', '.env.test.txt');
		const dotEnvTestContent = await fs.readFile(dotEnvTestPath, 'utf8');

		await fs.writeFile(
			path.join(Environment.getRoot(), '.env.test'),
			dotEnvTestContent,
		);

		spinner.succeed('Added files:');
		console.log(`  file://${path.join(Environment.getRoot(), 'playwright.config.ts')}`);
		console.log(`  file://${path.join(Environment.getRoot(), '.env.test')}`);
	});

const initTSCommand = new Command('ts')
	.description('Initialize TypeScript environment')
	.addOption(pathOption)
	.action(async (subcommand, args) => {
		const packageFactory = PackageFactoryProvider.create();
		const extensionsStream: NodeJS.ReadableStream = findPackages({
			startDirectory: Environment.getRoot(),
			packageFactory,
		});

		const tsconfig: FlexibleCompilerOptions = {
			compilerOptions: {
				baseUrl: Environment.getRoot(),
				paths: {},
			},
		};

		let aliasesCount = 0;

		console.log('Preparing TypeScript environment');
		const aliasesConfigSpinner = ora(`Created aliases for 0 extensions`).start();

		extensionsStream
			.on('data', ({ extension }: { extension: BasePackage }) => {
				if (/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/.test(extension.getName()))
				{
					const relativePath = path.relative(Environment.getRoot(), extension.getInputPath());
					tsconfig.compilerOptions.paths[extension.getName()] = [`./${relativePath}`];

					aliasesConfigSpinner.text = `Created aliases for ${aliasesCount} extensions`;

					aliasesCount++;
				}
			})
			.on('done', async () => {
				await fs.writeFile(
					path.join(Environment.getRoot(), 'aliases.tsconfig.json'),
					JSON.stringify(tsconfig, null, 4),
				);

				aliasesConfigSpinner.succeed(`aliases.tsconfig.json generated successfully with ${aliasesCount} aliases`);
				console.log(
					`  file://${path.join(Environment.getRoot(), 'aliases.tsconfig.json')}\n`,
				);

				const tsConfigSpinner = ora(`Generate tsconfig.json`).start();
				const templateContent = await fs.readFile(path.join(__dirname, 'templates', 'tsconfig.json.txt'), 'utf-8');
				await fs.writeFile(
					path.join(Environment.getRoot(), 'tsconfig.json'),
					templateContent,
				);

				tsConfigSpinner.succeed(`tsconfig.json generated successfully with extends by aliases.tsconfig.json`);
				console.log(
					`  file://${path.join(Environment.getRoot(), 'tsconfig.json')}`,
				);

				process.exit(0);
			})
			.on('error', (err: Error) => {
				aliasesConfigSpinner.fail('Error while reading packages:');
				console.error(err);
				process.exit(1);
			});
	});

const initCommand = new Command('init')
	.description('Initialize environment')
	.addOption(pathOption)
	.action(async (subcommand, args) => {
		await initTestsCommand.parseAsync([]);
		await initTSCommand.parseAsync([]);
	});

initCommand
	.addCommand(initTSCommand)
	.addCommand(initTestsCommand);

export {
	initCommand,
};
