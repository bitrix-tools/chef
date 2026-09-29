import * as fs from 'node:fs';
import * as path from 'node:path';

import { getTypeScriptApi } from './typescript-api';

import type { API, ParsedCommandLine } from 'typescript/unstable/sync';

type RawTsConfig = {
	extends?: string | string[];
	compilerOptions?: {
		baseUrl?: string;
		paths?: Record<string, string[]>;
	};
};

export async function loadTsConfig(configPath: string, packageRoot: string): Promise<ParsedCommandLine>
{
	const api = await getTypeScriptApi();
	const tsConfig = readRawTsConfig(api, configPath);
	if (tsConfig?.extends)
	{
		tsConfig.extends = resolveExtends(configPath, tsConfig.extends);
	}

	// Parsed against packageRoot, not the config directory: a root tsconfig usually
	// includes the whole repository, and chef only needs the options, not the file list.
	const config = api.parseJsonConfigFileContent(tsConfig ?? {}, { configDirectory: packageRoot });

	// Relative `paths` resolve against `baseUrl` when some config in the `extends` chain sets it,
	// otherwise against the directory of the config that declares `paths`. TypeScript 7 removed
	// `baseUrl`, so it is resolved here once and dropped from the options passed to the compiler.
	const baseUrl = findInExtendsChain(api, configPath, (rawConfig, configDir) => {
		const value = rawConfig.compilerOptions?.baseUrl;

		return value ? path.resolve(configDir, value) : null;
	});
	const pathsDir = findInExtendsChain(api, configPath, (rawConfig, configDir) => {
		return rawConfig.compilerOptions?.paths ? configDir : null;
	});
	const baseDir = baseUrl ?? pathsDir ?? path.dirname(configPath);

	delete (config.options as { baseUrl?: string }).baseUrl;

	config.options.paths = Object.entries(config.options.paths ?? {}).reduce((acc, [extensionName, paths]) => {
		acc[extensionName] = paths.map((filePath) => {
			return path.resolve(baseDir, filePath);
		});

		return acc;
	}, {} as Record<string, string[]>);

	return config;
}

function readRawTsConfig(api: API, configPath: string): RawTsConfig | null
{
	const { config } = api.readConfigFile(configPath);

	return (config ?? null) as RawTsConfig | null;
}

function resolveExtends(configPath: string, value: string | string[]): string[]
{
	const entries = Array.isArray(value) ? value : [value];

	return entries.map((entry) => {
		const isPathLike = entry.startsWith('.') || path.isAbsolute(entry);

		return isPathLike ? path.resolve(path.dirname(configPath), entry) : entry;
	});
}

/**
 * Walks the config and everything it extends, nearest first: the config itself overrides what it
 * extends, and a later `extends` entry overrides an earlier one.
 */
function findInExtendsChain(
	api: API,
	configPath: string,
	pick: (rawConfig: RawTsConfig, configDir: string) => string | null,
	visited = new Set<string>(),
): string | null
{
	if (visited.has(configPath) || !fs.existsSync(configPath))
	{
		return null;
	}

	visited.add(configPath);

	const rawConfig = readRawTsConfig(api, configPath);
	if (!rawConfig)
	{
		return null;
	}

	const picked = pick(rawConfig, path.dirname(configPath));
	if (picked)
	{
		return picked;
	}

	const parents = rawConfig.extends ? resolveExtends(configPath, rawConfig.extends) : [];
	for (const parent of parents.reverse())
	{
		const found = findInExtendsChain(api, parent, pick, visited);
		if (found)
		{
			return found;
		}
	}

	return null;
}
