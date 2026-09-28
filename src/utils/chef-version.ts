import * as fs from 'node:fs';
import * as path from 'node:path';

import { getChefRoot } from './chef-root';

let version: string | undefined;

export function getChefVersion(): string
{
	if (version !== undefined)
	{
		return version;
	}

	version = 'unknown';

	const root = getChefRoot();
	if (root)
	{
		try
		{
			version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).version;
		}
		catch
		{
			// ignore
		}
	}

	return version;
}
