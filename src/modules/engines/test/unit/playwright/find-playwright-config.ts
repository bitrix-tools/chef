import { pathToFileURL } from 'node:url';

import { FileFinder } from '../../../../../utils/file-finder';

import type { PlaywrightTestConfig } from '@playwright/test';
import type { BrowserType } from '../../test-types';

const KNOWN_BROWSERS: Record<string, BrowserType> = {
	chromium: 'chromium',
	firefox: 'firefox',
	webkit: 'webkit',
};

const DEFAULT_BROWSERS: BrowserType[] = ['chromium', 'firefox', 'webkit'];

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

	const configModule = await import(pathToFileURL(configPath).href);

	return (
		configModule.default.default
		|| configModule.default
		|| configModule
		|| null
	);
}

export function getBrowsersFromConfig(config: PlaywrightTestConfig | null): BrowserType[]
{
	if (!config?.projects?.length)
	{
		return DEFAULT_BROWSERS;
	}

	const browsers = new Set<BrowserType>();

	for (const project of config.projects)
	{
		const browserType = (project as any).use?.defaultBrowserType
			?? KNOWN_BROWSERS[project.name as string];

		if (browserType && KNOWN_BROWSERS[browserType])
		{
			browsers.add(KNOWN_BROWSERS[browserType]);
		}
	}

	return browsers.size > 0 ? [...browsers] : DEFAULT_BROWSERS;
}
