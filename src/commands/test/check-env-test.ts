import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

import chalk from 'chalk';
import boxen from 'boxen';

import { Environment } from '../../environment/environment';
import { FileFinder } from '../../utils/file-finder';

const DEFAULT_BASE_URL = 'http://localhost';

let baseUrlWarningShown = false;
let credentialsWarningShown = false;
let playwrightVersionWarningShown = false;

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

function readPlaywrightVersion(fromDirectory: string): string | null
{
	try
	{
		const require = createRequire(path.join(fromDirectory, 'noop.js'));
		const manifest = require('@playwright/test/package.json');

		return typeof manifest?.version === 'string' ? manifest.version : null;
	}
	catch
	{
		// Not installed there — nothing to compare against, so nothing to warn about.
		return null;
	}
}

/**
 * Both runners execute the project's Playwright: e2e spawns `npx playwright` from the
 * project root, and unit resolves the module from there (see resolvePlaywright). So the
 * version shipped with chef never runs, and the two drifting apart is harmless for
 * `chef test`. It is still a trap the moment someone runs Playwright by hand and reaches
 * for chef's binary: @playwright/test then loads twice from two trees and dies with
 * "You have two different versions of @playwright/test". Say so up front, and say which
 * binary to use.
 */
export function checkPlaywrightVersionWarning(): void
{
	if (playwrightVersionWarningShown)
	{
		return;
	}

	const root = Environment.getRoot();
	if (!root)
	{
		return;
	}

	const projectVersion = readPlaywrightVersion(root);
	const chefVersion = readPlaywrightVersion(import.meta.dirname);

	// Compare minor lines: Playwright's test runner and its browser protocol move together
	// within a minor, so a patch difference is not what triggers the dual-version failure.
	const minor = (version: string): string => version.split('.').slice(0, 2).join('.');
	if (!projectVersion || !chefVersion || minor(projectVersion) === minor(chefVersion))
	{
		return;
	}

	showWarning([
		`${chalk.bold('@playwright/test')} versions differ:`,
		'',
		`  project  ${chalk.cyan(projectVersion)}`,
		`  chef     ${chalk.cyan(chefVersion)}`,
		'',
		`${chalk.bold('chef test')} runs the project's runner, so this does not affect it.`,
		'',
		'To call Playwright directly, use the project binary:',
		'',
		chalk.dim('  ./node_modules/.bin/playwright test <spec>'),
		'',
		"Using chef's own binary loads @playwright/test twice and fails with",
		chalk.dim('  "You have two different versions of @playwright/test"'),
	]);
	playwrightVersionWarningShown = true;
}
