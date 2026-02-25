import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import boxen from 'boxen';
import logSymbols from 'log-symbols';

import { Environment } from '../../environment/environment';
import { pathOption } from './options/path-option';
import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { findPackages } from '../../utils/package/find-packages';
import { TemplateService } from '../../modules/services/template/template.service';
import { safeFileWrite, SaveFileStatus } from '../../utils/safe.file.write';
import { multiline } from '../../utils/multiline.text.tag';

import type { FlexibleCompilerOptions } from '@rollup/plugin-typescript';
import type { BasePackage } from '../../modules/packages/base-package';

const initTestsCommand = new Command('tests')
	.description('Initialize tests environment')
	.option('-f, --force', 'Force initialization')
	.addOption(pathOption)
	.action(async () => {
		console.log(
			multiline`
				Preparing test environment in ${Environment.getRoot()}
				
				The following files will be added:
				  • ${chalk.cyan('playwright.config.ts')} — Main config for running e2e and unit tests in browser
				  • ${chalk.cyan('.env.test')} — Stores credentials for test authentication
			`,
		);

		console.log('');

		const templateService = new TemplateService(
			path.join(__dirname, 'templates'),
		);

		const targetPlaywrightConfigPath = path.join(Environment.getRoot(), 'playwright.config.ts');
		const playWrightConfigContent = await templateService.get('playwright.config.ts.txt');
		const playwrightConfigStatus = await safeFileWrite({
			filePath: targetPlaywrightConfigPath,
			data: playWrightConfigContent,
		});

		if (playwrightConfigStatus !== SaveFileStatus.CREATED)
		{
			console.log('');
		}

		const targetDotEnvTestPath = path.join(Environment.getRoot(), '.env.test');
		const dotEnvTestContent = await templateService.get('.env.test.txt');
		const dotEnvTestStatus = await safeFileWrite({
			filePath: targetDotEnvTestPath,
			data: dotEnvTestContent,
		});

		const results = [
			{
				file: 'playwright.config.ts',
				status: playwrightConfigStatus,
			},
			{
				file: '.env.test',
				status: dotEnvTestStatus,
			}
		];

		const statusMap = {
			[SaveFileStatus.CREATED]: 'Files created:',
			[SaveFileStatus.REPLACED]: 'Files replaced:',
		};

		const handledStatuses = [SaveFileStatus.CREATED, SaveFileStatus.REPLACED];
		const filesChangedText = handledStatuses.reduce((acc, status) => {
			const files = results.filter((result) => {
				return result.status === status;
			});

			if (files.length > 0)
			{
				acc += chalk.bold(`${statusMap[status]}\n`);
				for (const { file } of files)
				{
					if (file === 'playwright.config.ts')
					{
						acc += `  • ${chalk.yellow(file)} — Main config for running e2e and unit tests in browser\n`;
					}

					if (file === '.env.test')
					{
						acc += `  • ${chalk.yellow(file)} — Stores credentials for test authentication\n`;
					}
				}
			}

			return acc;
		}, '');

		const message = multiline`
			${filesChangedText.trimEnd().split('\n').join('\n\t\t\t').replace(/\n$/, '')}
			
			${chalk.bold("What these files do:")}
			  • ${chalk.cyan("playwright.config.ts")} — enables running Mocha unit tests in the browser via Playwright
			  • ${chalk.cyan(".env.test")} — allows automatic login during tests, avoiding manual auth
			  
			${chalk.bold(`Next step — Edit ${chalk.yellow('.env.test')} with your local credentials:`)}
			  • ${chalk.cyan('BASE_URL')} — Your local installation address (e.g. http://localhost)
			  • ${chalk.cyan('LOGIN')} — Your test user login
			  • ${chalk.cyan('PASSWORD')} — Your test user password
			  
			${chalk.bold('Run tests with:')} ${chalk.green('chef test')}
			${chalk.bold('More info:')} ${chalk.green('chef test --help')}
			
			${chalk.bold.red(`!! SECURITY WARNING !!`)}
			Do NOT commit ${chalk.bold.red('.env.test')} to Git or publish it to production.
			It contains sensitive credentials and should remain local only.
		`;

		console.log(
			'\n' +
			boxen(message, {
				padding: 1,
				borderStyle: 'round',
				borderColor: 'green',
				title: chalk.bold.green(
					`✓ Test Environment Configured Successfully!`,
				),
			}),
		);
	});

const initTSCommand = new Command('ts')
	.description('Initialize TypeScript environment')
	.addOption(pathOption)
	.action(async () => {
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

		const leadMessage = multiline`
			Preparing TypeScript environment in ${Environment.getRoot()}

			${chalk.bold('The following files will be added/updated:')}
			  • ${chalk.cyan('aliases.tsconfig.json')} — Contains path aliases for all extensions
			  • ${chalk.cyan('tsconfig.json')} — Main TypeScript config that extends aliases
		`;

		console.log(leadMessage);
		console.log('');

		return new Promise<void>((resolve, reject) => {
			console.log(chalk.bold('Preparing paths aliases'));

			const aliasesConfigSpinner = ora({
				prefixText: ' ',
				text: 'Scanning extensions...',
			});

			aliasesConfigSpinner.start();

			extensionsStream
				.on('data', ({ extension }: { extension: BasePackage }) => {
					if (/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/.test(extension.getName())) {
						const relativePath = path.relative(
							Environment.getRoot(),
							extension.getInputPath(),
						);
						tsconfig.compilerOptions.paths[extension.getName()] = [`./${relativePath}`];

						aliasesCount++;
						aliasesConfigSpinner.text = `Found ${aliasesCount} extensions`;
					}
				})
				.on('done', async () => {
					try
					{
						const aliasesPath = path.join(Environment.getRoot(), 'aliases.tsconfig.json');
						await fs.writeFile(
							aliasesPath,
							JSON.stringify(tsconfig, null, 4),
						);

						aliasesConfigSpinner.succeed(
							`aliases.tsconfig.json generated successfully with ${aliasesCount} aliases`,
						);
						console.log(`  → file://${aliasesPath}\n`,);

						console.log(chalk.bold('Preparing tsconfig.json'));
						const templateService = new TemplateService(
							path.join(__dirname, 'templates'),
						);

						const tsConfigPath = path.join(Environment.getRoot(), 'tsconfig.json');
						const tsConfigContent = templateService.get('tsconfig.json.txt');
						const tsConfigStatus = await safeFileWrite({
							filePath: tsConfigPath,
							theme: {
								prefix: `  ${chalk.green(logSymbols.success)}`,
							},
							data: tsConfigContent,
						});

						const results = [
							{
								file: 'aliases.tsconfig.json',
								status: SaveFileStatus.CREATED,
							},
							{
								file: 'tsconfig.json',
								status: tsConfigStatus,
							}
						];

						const statusMap = {
							[SaveFileStatus.CREATED]: 'Files created:',
							[SaveFileStatus.REPLACED]: 'Files replaced:',
						};

						const handledStatuses = [SaveFileStatus.CREATED, SaveFileStatus.REPLACED];
						const filesChangedText = handledStatuses.reduce((acc, status) => {
							const files = results.filter((result) => {
								return result.status === status;
							});

							if (files.length > 0)
							{
								acc += chalk.bold(`${statusMap[status]}\n`);
								for (const { file } of files)
								{
									if (file === 'aliases.tsconfig.json')
									{
										acc += `  • ${chalk.yellow(file)} — Contains ${aliasesCount} path aliases for easier imports\n`;
									}

									if (file === 'tsconfig.json')
									{
										acc += `  • ${chalk.yellow(file)} — Main config that extends aliases for TypeScript compilation\n`;
									}
								}
							}

							return acc;
						}, '');

						if (tsConfigStatus === SaveFileStatus.CANCELLED)
						{
							const requiredMessage = multiline`
								To use the generated aliases, add the following to your existing tsconfig.json:
								${chalk.cyan('{')}
								${chalk.cyan('    "extends": "./aliases.tsconfig.json"')}
								${chalk.cyan('}')}
								
								${chalk.blue('Example:')}
								${chalk.grey('{')}
								${chalk.grey('    "extends": "./aliases.tsconfig.json",')}
								${chalk.grey('    "compilerOptions": {')}
								${chalk.grey('        // your other options...')}
								${chalk.grey('    }') }
								${chalk.grey('}')}
							`;

							console.log(
								'\n' +
								boxen(
									requiredMessage,
									{
										title: `Manual update required!`,
										padding: 1,
										borderStyle: 'round',
										borderColor: 'red',
									}
								)
							);
						}

						const titleStatus = (() => {
							if (
								tsConfigStatus === SaveFileStatus.REPLACED
								|| tsConfigStatus === SaveFileStatus.CREATED
							)
							{
								return 'Successfully';
							}

							return 'Partially';
						})();

						const message = multiline`
							${filesChangedText.trimEnd().split("\n").join("\n\t\t\t\t\t\t\t").replace(/\n$/, "")}
							
							${chalk.bold("Next steps:")}${
								tsConfigStatus === SaveFileStatus.CANCELLED 
									? "\n\t\t\t\t\t\t\t  • Update your existing tsconfig.json to extend aliases.tsconfig.json" 
									: ""
							}
							  • You can now import modules using aliases like: import { Button } from 'ui.buttons';
							  • Run TypeScript/JS compilation: ${chalk.green('chef build')};
							  • More info: ${chalk.green('chef build --help')};
						`;

						console.log('');
						console.log(
							boxen(
								message,
								{
									title: chalk.bold.green(`✓ TypeScript Environment ${titleStatus} Configured!`),
									padding: 1,
									borderStyle: 'round',
									borderColor: 'yellow',
								},
							),
						);

						resolve();
					}
					catch (error)
					{
						reject(error);
					}
				})
				.on('error', (err: Error) => {
					aliasesConfigSpinner.fail('Error while scanning packages:');
					console.error(err);
					reject(err);
				});
		});
	});

const initCommand = new Command('init')
	.description('Initialize environment')
	.addOption(pathOption)
	.action(async () => {
		await initTestsCommand.parseAsync([]);
		console.log('\n');
		await initTSCommand.parseAsync([]);
	});

initCommand
	.addCommand(initTSCommand)
	.addCommand(initTestsCommand);

export { initCommand };
