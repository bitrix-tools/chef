import * as fs from 'node:fs';

import chalk from 'chalk';
import boxen from 'boxen';

import { Environment } from '../../environment/environment';
import { findEnvTestFile, readEnvTestFile } from '../../modules/engines/test/env-test-file';

const DEFAULT_BASE_URL = 'http://localhost';

let baseUrlWarningShown = false;
let credentialsWarningShown = false;

function findEnvTestPath(packageRoot: string): string | null
{
	return findEnvTestFile(packageRoot, Environment.getRoot());
}

function showWarning(lines: string[]): void
{
	console.log('');
	console.log(boxen(lines.join('\n'), {
		padding: 1,
		borderStyle: 'round',
		borderColor: 'yellow',
		title: chalk.yellow.bold('Warning'),
	}));
}

export function checkBaseUrlWarning(baseURL: string | undefined, packageRoot: string): void
{
	if (baseUrlWarningShown)
	{
		return;
	}

	if (baseURL && baseURL !== DEFAULT_BASE_URL)
	{
		return;
	}

	const envTestPath = findEnvTestPath(packageRoot);
	if (!envTestPath)
	{
		return;
	}

	const hasEnvTest = fs.existsSync(envTestPath);
	const lines: string[] = [];

	if (!hasEnvTest)
	{
		lines.push(`${chalk.bold('.env.test')} not found next to playwright.config.ts.`);
		lines.push('');
		lines.push(`Tests will use the default ${chalk.cyan(DEFAULT_BASE_URL)} as base URL.`);
		lines.push(`Create ${chalk.bold('.env.test')} with your local Bitrix URL:`);
		lines.push('');
		lines.push(chalk.dim('  BASE_URL=http://your-local-bitrix.test'));
	}
	else
	{
		lines.push(`${chalk.bold('BASE_URL')} is not set in ${chalk.bold('.env.test')}.`);
		lines.push('');
		lines.push(`Tests will use the default ${chalk.cyan(DEFAULT_BASE_URL)} as base URL.`);
		lines.push(`Set your local Bitrix URL in ${chalk.bold('.env.test')}:`);
		lines.push('');
		lines.push(chalk.dim('  BASE_URL=http://your-local-bitrix.test'));
	}

	showWarning(lines);
	baseUrlWarningShown = true;
}

export function checkCredentialsWarning(packageRoot: string): void
{
	if (credentialsWarningShown)
	{
		return;
	}

	const envTestPath = findEnvTestPath(packageRoot);
	if (!envTestPath || !fs.existsSync(envTestPath))
	{
		return;
	}

	const vars = readEnvTestFile(envTestPath);
	if (vars.LOGIN && vars.PASSWORD)
	{
		return;
	}

	const missing: string[] = [];
	if (!vars.LOGIN)
	{
		missing.push('LOGIN');
	}
	if (!vars.PASSWORD)
	{
		missing.push('PASSWORD');
	}

	const lines: string[] = [];
	lines.push(`${chalk.bold(missing.join(' and '))} not set in ${chalk.bold('.env.test')}.`);
	lines.push('');
	lines.push('E2E tests that use the auth fixture will not be able to log in.');
	lines.push(`Add credentials to ${chalk.bold('.env.test')}:`);
	lines.push('');
	lines.push(chalk.dim('  LOGIN=admin'));
	lines.push(chalk.dim('  PASSWORD=your-password'));

	showWarning(lines);
	credentialsWarningShown = true;
}
