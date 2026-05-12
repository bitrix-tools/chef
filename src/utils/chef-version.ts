import * as fs from 'node:fs';
import * as path from 'node:path';

import { FileFinder } from './file-finder';

let version: string | undefined;

function getCurrentDir(): string
{
	if (typeof __dirname !== 'undefined')
	{
		return __dirname;
	}

	return import.meta.dirname;
}

export function getChefVersion(): string
{
	if (version !== undefined)
	{
		return version;
	}

	try
	{
		const fromDir = getCurrentDir();
		const pkgPath = FileFinder.findUpFile({
			fileName: 'package.json',
			fromDir,
			rootDir: path.parse(fromDir).root,
		});

		if (pkgPath)
		{
			const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
			if (pkg.name === '@bitrix/chef')
			{
				version = pkg.version;

				return version;
			}
		}
	}
	catch
	{
		// ignore
	}

	version = 'unknown';

	return version;
}
