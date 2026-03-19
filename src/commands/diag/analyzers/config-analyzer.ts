import type { PackageSnapshot } from '../package-snapshot';

export type ConfigResult = {
	name: string;
	key: string;
	value: unknown;
};

export function analyzeConfig(
	packages: PackageSnapshot[],
	keys: string[],
	value?: string,
): ConfigResult[]
{
	const results: ConfigResult[] = [];

	for (const pkg of packages)
	{
		for (const key of keys)
		{
			const configValue = pkg.bundleConfig[key];

			if (configValue === undefined)
			{
				continue;
			}

			if (value !== undefined && !matchesValue(configValue, value))
			{
				continue;
			}

			results.push({ name: pkg.name, key, value: configValue });
		}
	}

	return results.sort((a, b) => a.name.localeCompare(b.name));
}

export function analyzeConfigExcept(
	packages: PackageSnapshot[],
	excludeKeys: Set<string>,
): ConfigResult[]
{
	const results: ConfigResult[] = [];

	for (const pkg of packages)
	{
		for (const [key, value] of Object.entries(pkg.bundleConfig))
		{
			if (!excludeKeys.has(key))
			{
				results.push({ name: pkg.name, key, value });
			}
		}
	}

	return results.sort((a, b) => {
		const nameCompare = a.name.localeCompare(b.name);
		if (nameCompare !== 0)
		{
			return nameCompare;
		}

		return a.key.localeCompare(b.key);
	});
}

export type ConfigMissingResult = {
	name: string;
	missingKeys: string[];
};

export function analyzeConfigMissing(
	packages: PackageSnapshot[],
	keys: string[],
): ConfigMissingResult[]
{
	const results: ConfigMissingResult[] = [];

	for (const pkg of packages)
	{
		const missingKeys = keys.filter((key) => !(key in pkg.bundleConfig));

		if (missingKeys.length > 0)
		{
			results.push({ name: pkg.name, missingKeys });
		}
	}

	return results.sort((a, b) => a.name.localeCompare(b.name));
}

function matchesValue(configValue: unknown, search: string): boolean
{
	if (typeof configValue === 'string')
	{
		return configValue.includes(search);
	}

	if (Array.isArray(configValue))
	{
		return configValue.some((item) =>
			typeof item === 'string' && item.includes(search),
		);
	}

	if (typeof configValue === 'boolean' || typeof configValue === 'number')
	{
		return String(configValue) === search;
	}

	return false;
}
