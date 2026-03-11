import * as path from 'node:path';

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import boxen from 'boxen';
import logSymbols from 'log-symbols';

import { Environment } from '../../environment/environment';
import { createPathOption } from '../../shared/options/path-option';
import { multiline } from '../../utils/multiline-text-tag';
import { ProjectInitializer, SaveFileStatus } from '../../modules/services/project-initializer';

const initTestsCommand = new Command('tests')
	.description('Set up Playwright config and .env.test for browser tests')
	.option('-f, --force', 'Overwrite existing files without prompting')
	.addOption(createPathOption('Project root where configs and helpers will be initialized'))
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

		const initializer = new ProjectInitializer({
			rootPath: Environment.getRoot(),
			templateDirectory: path.join(import.meta.dirname, 'templates'),
		});

		const result = await initializer.initTests();

		const statusMap = {
			[SaveFileStatus.CREATED]: 'Files created:',
			[SaveFileStatus.REPLACED]: 'Files replaced:',
		};

		const fileDescriptions: Record<string, string> = {
			'playwright.config.ts': 'Main config for running e2e and unit tests in browser',
			'.env.test': 'Stores credentials for test authentication',
		};

		const handledStatuses = [SaveFileStatus.CREATED, SaveFileStatus.REPLACED];
		const filesChangedText = handledStatuses.reduce((acc, status) => {
			const files = result.files.filter((f) => f.status === status);

			if (files.length > 0)
			{
				acc += chalk.bold(`${statusMap[status]}\n`);
				for (const { name } of files)
				{
					acc += `  • ${chalk.yellow(name)} — ${fileDescriptions[name]}\n`;
				}
			}

			return acc;
		}, '');

		const message = [
			filesChangedText.trimEnd(),
			'',
			`${chalk.bold("What these files do:")}`,
			`  • ${chalk.cyan("playwright.config.ts")} — enables running Mocha unit tests in the browser via Playwright`,
			`  • ${chalk.cyan(".env.test")} — allows automatic login during tests, avoiding manual auth`,
			'',
			`${chalk.bold(`Next step — Edit ${chalk.yellow('.env.test')} with your local credentials:`)}`,
			`  • ${chalk.cyan('BASE_URL')} — Your local installation address (e.g. http://localhost)`,
			`  • ${chalk.cyan('LOGIN')} — Your test user login`,
			`  • ${chalk.cyan('PASSWORD')} — Your test user password`,
			'',
			`${chalk.bold('Run tests with:')} ${chalk.green('chef test')}`,
			`${chalk.bold('More info:')} ${chalk.green('chef test --help')}`,
			'',
			`${chalk.bold.red('!! SECURITY WARNING !!')}`,
			`Do NOT commit ${chalk.bold.red('.env.test')} to Git or publish it to production.`,
			`It contains sensitive credentials and should remain local only.`,
		].join('\n');

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

const initBuildCommand = new Command('build')
	.description('Generate TypeScript configs, path aliases, and browserslist for extensions')
	.addOption(createPathOption('Project root where configs and helpers will be initialized'))
	.action(async () => {
		const leadMessage = multiline`
			Preparing build environment in ${Environment.getRoot()}

			${chalk.bold('The following files will be added/updated:')}
			  • ${chalk.cyan('aliases.tsconfig.json')} — Contains path aliases for all extensions
			  • ${chalk.cyan('tsconfig.json')} — Main TypeScript config that extends aliases
			  • ${chalk.cyan('.browserslistrc')} — Target browsers for transpilation and autoprefixing
		`;

		console.log(leadMessage);
		console.log('');
		console.log(chalk.bold('Preparing paths aliases'));

		const aliasesConfigSpinner = ora({
			prefixText: ' ',
			text: 'Scanning extensions...',
		});

		aliasesConfigSpinner.start();

		const initializer = new ProjectInitializer({
			rootPath: Environment.getRoot(),
			templateDirectory: path.join(import.meta.dirname, 'templates'),
		});

		try
		{
			const result = await initializer.initBuild({
				onProgress: (count) => {
					aliasesConfigSpinner.text = `Found ${count} extensions`;
				},
				onAliasesDone: (count) => {
					const aliasesPath = path.join(Environment.getRoot(), 'aliases.tsconfig.json');
					aliasesConfigSpinner.succeed(
						`aliases.tsconfig.json generated successfully with ${count} aliases`,
					);
					console.log(`  → file://${aliasesPath}\n`);
				},
				onBeforeFileWrite: (fileName) => {
					if (fileName === 'tsconfig.json')
					{
						console.log(chalk.bold('Preparing tsconfig.json'));
					}

					if (fileName === '.browserslistrc')
					{
						console.log('');
						console.log(chalk.bold('Preparing .browserslistrc'));
					}
				},
				theme: {
					prefix: `  ${chalk.green(logSymbols.success)}`,
				},
			});

			const tsConfigFile = result.files.find((f) => f.name === 'tsconfig.json');
			const tsConfigStatus = tsConfigFile?.status;

			const fileDescriptions: Record<string, string> = {
				'aliases.tsconfig.json': `Contains ${result.aliasesCount} path aliases for easier imports`,
				'tsconfig.json': 'Main config that extends aliases for TypeScript compilation',
				'.browserslistrc': 'Target browsers for transpilation and autoprefixing',
			};

			const statusMap = {
				[SaveFileStatus.CREATED]: 'Files created:',
				[SaveFileStatus.REPLACED]: 'Files replaced:',
			};

			const handledStatuses = [SaveFileStatus.CREATED, SaveFileStatus.REPLACED];
			const filesChangedText = handledStatuses.reduce((acc, status) => {
				const files = result.files.filter((f) => f.status === status);

				if (files.length > 0)
				{
					acc += chalk.bold(`${statusMap[status]}\n`);
					for (const { name } of files)
					{
						acc += `  • ${chalk.yellow(name)} — ${fileDescriptions[name]}\n`;
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

			const messageLines = [
				filesChangedText.trimEnd(),
				'',
				`${chalk.bold("Next steps:")}`,
			];

			if (tsConfigStatus === SaveFileStatus.CANCELLED)
			{
				messageLines.push(`  • Update your existing tsconfig.json to extend aliases.tsconfig.json`);
			}

			messageLines.push(
				`  • You can now import modules using aliases like: import { Button } from 'ui.buttons';`,
				`  • Run TypeScript/JS compilation: ${chalk.green('chef build')};`,
				`  • More info: ${chalk.green('chef build --help')};`,
			);

			const message = messageLines.join('\n');

			console.log('');
			console.log(
				boxen(
					message,
					{
						title: chalk.bold.green(`✓ Build Environment ${titleStatus} Configured!`),
						padding: 1,
						borderStyle: 'round',
						borderColor: 'yellow',
					},
				),
			);
		}
		catch (error)
		{
			aliasesConfigSpinner.fail('Error while scanning packages:');
			console.error(error);
			throw error;
		}
	});

const initCommand = new Command('init')
	.description('Initialize testing and build tooling for your Bitrix project')
	.addOption(createPathOption('Project root where configs and helpers will be initialized'))
	.action(async () => {
		await initTestsCommand.parseAsync([]);
		console.log('\n');
		await initBuildCommand.parseAsync([]);
	});

initCommand
	.addCommand(initBuildCommand)
	.addCommand(initTestsCommand);

export { initCommand };
