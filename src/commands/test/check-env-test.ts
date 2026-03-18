import * as fs from 'node:fs';
import * as path from 'node:path';

import chalk from 'chalk';
import boxen from 'boxen';

import { Environment } from '../../environment/environment';
import { FileFinder } from '../../utils/file-finder';

const DEFAULT_BASE_URL = 'http://localhost';

let baseUrlWarningShown = false;
let credentialsWarningShown = false;

function findEnvTestPath(packageRoot: string): string | null
{
	const playwrightConfigPath = FileFinder.findUpFile({
		fileName: 'playwright.config.ts',
		fromDir: packageRoot,
		rootDir: Environment.getRoot(),
	});

	if (!playwrightConfigPath)
	{
		return null;
	}

	return path.join(path.dirname(playwrightConfigPath), '.env.test');
}

function parseEnvFile(envPath: string): Record<string, string>
{
	const content = fs.readFileSync(envPath, 'utf-8');
	const vars: Record<string, string> = {};

	for (const line of content.split('\n'))
	{
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#'))
		{
			continue;
		}

		const match = trimmed.match(/^([A-Z_]+)\s*=\s*(.*)$/);
		if (match)
		{
			vars[match[1]] = match[2].trim();
		}
	}

	return vars;
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

	const vars = parseEnvFile(envTestPath);
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
