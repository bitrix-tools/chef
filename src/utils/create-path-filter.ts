import picomatch from 'picomatch';

import { normalizePath } from './path/normalize';

export function createPathFilter(patterns: string[]): (filePath: string) => boolean
{
	if (patterns.length === 0)
	{
		return () => false;
	}

	const exactPaths = new Set<string>();
	const globPatterns: string[] = [];

	for (const pattern of patterns)
	{
		const normalized = normalizePath(pattern);
		if (/[*?{]/.test(normalized))
		{
			globPatterns.push(normalized);
		}
		else
		{
			exactPaths.add(normalized);
		}
	}

	const globMatcher = globPatterns.length > 0
		? picomatch(globPatterns, { dot: true })
		: null;

	return (filePath: string) => {
		const normalized = normalizePath(filePath);
		if (exactPaths.has(normalized))
		{
			return true;
		}

		if (globMatcher && globMatcher(normalized))
		{
			return true;
		}

		return false;
	};
}
