import type { BrowserVersions } from './types';

const nameMap: Record<string, keyof BrowserVersions> = {
	chrome: 'chrome',
	edge: 'edge',
	firefox: 'firefox',
	safari: 'safari',
};

/**
 * Parses browserslist-style target strings (e.g. ["chrome 109", "firefox 115"])
 * into a minimum-version map. Targets for unrecognized browsers are dropped.
 */
export function resolveTargetMins(targets: string[]): BrowserVersions
{
	const mins: BrowserVersions = {};

	for (const target of targets)
	{
		const match = target.match(/^([a-z_]+)\s+([\d.]+)$/);
		if (!match)
		{
			continue;
		}

		const [, name, versionStr] = match;
		const browser = nameMap[name];
		if (!browser)
		{
			continue;
		}

		const version = parseFloat(versionStr);
		if (mins[browser] === undefined || version < mins[browser])
		{
			mins[browser] = version;
		}
	}

	return mins;
}
