import * as path from 'node:path';

import type { ParsedCommandLine } from 'typescript';

export async function loadTsConfig(configPath: string, packageRoot: string): Promise<ParsedCommandLine>
{
	const { default: ts } = await import('typescript');
	const tsConfig = ts.readConfigFile(configPath, ts.sys.readFile);
	if (tsConfig.config && tsConfig.config.extends)
	{
		tsConfig.config.extends = path.join(path.dirname(configPath), tsConfig.config.extends);
	}

	const host = ts.createCompilerHost({}, true);

	const config = ts.parseJsonConfigFileContent(
		tsConfig.config,
		// @ts-ignore
		host,
		packageRoot,
	);

	const configDirname = path.dirname(configPath);

	config.options.paths = Object.entries(config.options.paths ?? {}).reduce((acc, [extensionName, paths]) => {
		acc[extensionName] = paths.map((filePath) => {
			return path.join(configDirname, filePath.replace('./', ''));
		});

		return acc;
	}, {});

	return config;
}
