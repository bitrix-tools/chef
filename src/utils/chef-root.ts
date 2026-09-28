import * as fs from 'node:fs';
import * as path from 'node:path';

import { FileFinder } from './file-finder';

let root: string | null | undefined;

function getCurrentDir(): string
{
	if (typeof __dirname !== 'undefined')
	{
		return __dirname;
	}

	return import.meta.dirname;
}

/**
 * Returns the root directory of the running @bitrix/chef package — works both
 * from sources (src/) and from the bundle (dist/). Null if it cannot be found.
 */
export function getChefRoot(): string | null
{
	if (root !== undefined)
	{
		return root;
	}

	root = null;

	try
	{
		const fromDir = getCurrentDir();
		const packageJsonPath = FileFinder.findUpFile({
			fileName: 'package.json',
			fromDir,
			rootDir: path.parse(fromDir).root,
		});

		if (packageJsonPath)
		{
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
			if (packageJson.name === '@bitrix/chef')
			{
				root = path.dirname(packageJsonPath);
			}
		}
	}
	catch
	{
		// ignore
	}

	return root;
}
