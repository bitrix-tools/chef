import { FileFinder } from '../../../../../utils/file-finder';

import type { PlaywrightTestConfig } from '@playwright/test';

function findPlaywrightConfigPath(packageRoot: string, projectRoot: string): string | null
{
	const tsVersion = FileFinder.findUpFile({
		fileName: 'playwright.config.ts',
		fromDir: packageRoot,
		rootDir: projectRoot,
	});

	if (tsVersion)
	{
		return tsVersion;
	}

	return FileFinder.findUpFile({
		fileName: 'playwright.config.js',
		fromDir: packageRoot,
		rootDir: projectRoot,
	});
}

export async function findPlaywrightConfig(packageRoot: string, projectRoot: string): Promise<PlaywrightTestConfig | null>
{
	const configPath = findPlaywrightConfigPath(packageRoot, projectRoot);
	if (configPath === null)
	{
		return null;
	}

	const configModule = await import(configPath);

	return (
		configModule.default.default
		|| configModule.default
		|| configModule
		|| null
	);
}
