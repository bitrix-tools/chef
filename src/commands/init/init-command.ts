import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ora from 'ora';
import chalk from 'chalk';
import boxen from 'boxen';
import { confirm } from '@inquirer/prompts';

import { Environment } from '../../environment/environment';
import { pathOption } from './options/path-option';
import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { findPackages } from '../../utils/package/find-packages';
import { TemplateService } from '../../modules/services/template/template.service';
import { fileExistsAsync } from '../../utils/file.exists.async';
import { safeFileWrite, SaveFileStatus } from '../../utils/safe.file.write';
import { multiline } from '../../utils/multiline.text.tag';

import type { FlexibleCompilerOptions } from '@rollup/plugin-typescript';
import type { BasePackage } from '../../modules/packages/base-package';

const initTestsCommand = new Command('tests')
	.description('Initialize tests environment')
	.option('-f, --force', 'Force initialization')
	.addOption(pathOption)
	.action(async (subcommand, args) => {
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
		const playwrightConfigStatus = await safeFileWrite(targetPlaywrightConfigPath, playWrightConfigContent);

		if (playwrightConfigStatus !== SaveFileStatus.CREATED)
		{
			console.log('');
		}

		const targetDotEnvTestPath = path.join(Environment.getRoot(), '.env.test');
		const dotEnvTestContent = await templateService.get('.env.test.txt');
		const dotEnvTestStatus = await safeFileWrite(targetDotEnvTestPath, dotEnvTestContent);

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
			${filesChangedText.split('\n').join('\n\t\t\t')}
			
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

		console.log('');

		console.log(
			multiline`
				${chalk.blue(`Preparing TypeScript environment in ${Environment.getRoot()}`)}
				
				${chalk.bold(`The following files will be added/updated:`)}
				  • ${chalk.cyan('aliases.tsconfig.json')} — Contains path aliases for all extensions
				  • ${chalk.cyan('tsconfig.json')} — Main TypeScript config that extends aliases
			`,
		);

		let aliasesCount = 0;

		return new Promise<void>((resolve, reject) => {
			const aliasesConfigSpinner = ora('Scanning extensions...').start();

			extensionsStream
				.on('data', ({ extension }: { extension: BasePackage }) => {
					if (/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/.test(extension.getName())) {
						const relativePath = path.relative(
							Environment.getRoot(),
							extension.getInputPath(),
						);
						tsconfig.compilerOptions.paths[extension.getName()] = [`./${relativePath}`];

						aliasesCount++;
						aliasesConfigSpinner.text = `Processed ${aliasesCount} extensions...`;
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
						console.log(`  → file://${aliasesPath}\n`);

						const tsconfigPath = path.join(Environment.getRoot(), 'tsconfig.json');
						let tsConfigCreated = false;

						if (await fileExistsAsync(tsconfigPath))
						{
							const overwrite = await confirm({
								message: `File "${path.basename(tsconfigPath)}" already exists. Overwrite?`,
								default: false,
							});

							if (overwrite)
							{
								const templateContent = await fs.readFile(
									path.join(__dirname, 'templates', 'tsconfig.json.txt'),
									'utf-8',
								);
								await fs.writeFile(
									tsconfigPath,
									templateContent,
								);

								const tsConfigSpinner = ora(`Generating tsconfig.json`).start();
								tsConfigSpinner.succeed(
									`tsconfig.json generated successfully with extends by aliases.tsconfig.json`,
								);
								console.log(
									`  → file://${tsconfigPath}`,
								);

								tsConfigCreated = true;
							}
							else
							{
								console.log(
									chalk.yellow(`  → File "${path.basename(tsconfigPath)}" not overwritten.`),
								);

								console.log(
									'\n' +
									boxen(
										'To use the generated aliases, add the following to your existing tsconfig.json:\n\n' +
										chalk.cyan('{\n  "extends": "./aliases.tsconfig.json"\n}') + '\n\n' +
										chalk.blue('Example:\n') +
										chalk.grey('{\n') +
										chalk.grey('  "extends": "./aliases.tsconfig.json",\n') +
										chalk.grey('  "compilerOptions": {\n') +
										chalk.grey('    // your other options...\n') +
										chalk.grey('  }\n') +
										chalk.grey('}\n'),
										{
											padding: 1,
											borderStyle: 'round',
											borderColor: 'yellow',
											title: chalk.bold.yellow('Manual update required'),
										}
									)
								);

								let message = '';

								message += chalk.bold('Files created:\n');
								message +=
									'  • ' +
									chalk.yellow('aliases.tsconfig.json') +
									` — Contains ${aliasesCount} path aliases for easier imports\n`;
								message += '\n';

								message += chalk.bold('What these files do:\n');
								message +=
									'  • ' +
									chalk.cyan('aliases.tsconfig.json') +
									' — Maps extension names to their source paths (e.g. "ui.buttons" → "/bitrix/js/ui/buttons")\n\n';

								message += chalk.bold('Next steps:\n');
								message += '  • Update your existing tsconfig.json to extend aliases.tsconfig.json\n';
								message += '  • You can now import modules using aliases like: import { Button } from "ui.buttons"\n';
								message += '  • Run TypeScript compilation: chef build\n';
								message += '  • More info: chef build --help\n\n';

								message += chalk.bold.blue(`Tip:\n`);
								message += `These configs help TypeScript resolve imports faster and make refactoring easier.\n`;

								console.log(
									'\n' +
									boxen(message, {
										padding: 1,
										borderStyle: 'round',
										borderColor: 'green',
										title: chalk.bold.green(
											`✓ TypeScript Environment Partially Configured!`,
										),
									}),
								);

								resolve();
								return;
							}
						}
						else
						{
							const templateContent = await fs.readFile(
								path.join(__dirname, 'templates', 'tsconfig.json.txt'),
								'utf-8',
							);
							await fs.writeFile(
								tsconfigPath,
								templateContent,
							);

							const tsConfigSpinner = ora(`Generating tsconfig.json`).start();
							tsConfigSpinner.succeed(
								`tsconfig.json generated successfully with extends by aliases.tsconfig.json`,
							);
							console.log(`  → file://${tsconfigPath}`);

							tsConfigCreated = true;
						}

						let message = '';

						message += chalk.bold('Files created:\n');
						message +=
							'  • ' + chalk.yellow('aliases.tsconfig.json') +
							` — Contains ${aliasesCount} path aliases for easier imports\n`;

						if (tsConfigCreated)
						{
							message +=
								'  • ' + chalk.yellow('tsconfig.json') +
								` — Main config that extends aliases for TypeScript compilation\n`;
						}
						message += '\n';

						message += chalk.bold('What these files do:\n');
						message +=
							'  • ' +
							chalk.cyan('aliases.tsconfig.json') +
							' — Maps extension names to their source paths (e.g. "@ui/button" → "./src/ui/button")\n';
						if (tsConfigCreated)
						{
							message +=
								'  • ' +
								chalk.cyan('tsconfig.json') +
								' — Includes the aliases and sets up TypeScript compiler options\n';
						}
						message += '\n';

						message += chalk.bold('Next steps:\n');
						message += '  • You can now import modules using aliases like: import Button from "@ui/button"\n';
						message += '  • Run TypeScript compilation: chef build\n';
						message += '  • More info: chef build --help\n\n';

						message += chalk.bold.blue(`💡 Tip:\n`);
						message += `These configs help TypeScript resolve imports faster and make refactoring easier.\n`;

						console.log(
							'\n' +
							boxen(message, {
								padding: 1,
								borderStyle: 'round',
								borderColor: 'green',
								title: chalk.bold.green(
									`✓ TypeScript Environment Configured Successfully!`,
								),
							}),
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
	.action(async (subcommand, args) => {
		await initTestsCommand.parseAsync([]);
		console.log('\n');
		await initTSCommand.parseAsync([]);
	});

initCommand
	.addCommand(initTSCommand)
	.addCommand(initTestsCommand);

export { initCommand };
