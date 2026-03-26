import picomatch from 'picomatch';

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
		if (/[*?{]/.test(pattern))
		{
			globPatterns.push(pattern);
		}
		else
		{
			exactPaths.add(pattern);
		}
	}

	const globMatcher = globPatterns.length > 0
		? picomatch(globPatterns, { dot: true })
		: null;

	return (filePath: string) => {
		if (exactPaths.has(filePath))
		{
			return true;
		}

		if (globMatcher && globMatcher(filePath))
		{
			return true;
		}

		return false;
	};
}
