import * as fs from 'node:fs';
import * as path from 'node:path';

import { FileFinder } from '../../../utils/file-finder';

export const DEFAULT_MOCHA_WRAPPER = '/dev/ui/cli/mocha-wrapper.php';

/**
 * `.env.test` lives next to the Playwright config, which is where `chef init tests`
 * puts both and where the config's own `dotenv.config()` looks for it.
 */
export function findEnvTestFile(packageRoot: string, projectRoot: string): string | null
{
	const playwrightConfigPath = FileFinder.findUpFile({
		fileName: 'playwright.config.ts',
		fromDir: packageRoot,
		rootDir: projectRoot,
	}) ?? FileFinder.findUpFile({
		fileName: 'playwright.config.js',
		fromDir: packageRoot,
		rootDir: projectRoot,
	});

	if (!playwrightConfigPath)
	{
		return null;
	}

	return path.join(path.dirname(playwrightConfigPath), '.env.test');
}

export function readEnvTestFile(envTestPath: string): Record<string, string>
{
	let content;
	try
	{
		content = fs.readFileSync(envTestPath, 'utf-8');
	}
	catch
	{
		return {};
	}

	const variables: Record<string, string> = {};

	for (const line of content.split('\n'))
	{
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#'))
		{
			continue;
		}

		const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
		if (match)
		{
			variables[match[1]] = match[2].trim();
		}
	}

	return variables;
}

/**
 * Where the unit-test runner page lives. Installs that serve `main/dev/public` under a
 * different prefix — or keep the wrapper elsewhere entirely — override it in `.env.test`
 * with either a root-relative path or a full URL.
 */
export function resolveMochaWrapper(packageRoot: string, projectRoot: string): string
{
	const fromProcess = process.env.MOCHA_WRAPPER?.trim();
	if (fromProcess)
	{
		return fromProcess;
	}

	const envTestPath = findEnvTestFile(packageRoot, projectRoot);
	if (!envTestPath)
	{
		return DEFAULT_MOCHA_WRAPPER;
	}

	const fromFile = readEnvTestFile(envTestPath).MOCHA_WRAPPER;

	return fromFile || DEFAULT_MOCHA_WRAPPER;
}
