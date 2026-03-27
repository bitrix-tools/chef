import { Option } from 'commander';
import picomatch from 'picomatch';

function parsePatterns(value: string, previous: string[]): string[]
{
	return [...previous, ...value.split(',').map((p) => p.trim()).filter(Boolean)];
}

export function createIncludeOption(): Option
{
	return new Option(
		'-i, --include <patterns>',
		'Include only extensions matching patterns, repeatable (e.g. --include ui.* --include crm.* or --include ui.*,crm.*)',
	).argParser(parsePatterns).default([]);
}

export function createExcludeOption(): Option
{
	return new Option(
		'-x, --exclude <patterns>',
		'Exclude extensions matching patterns, repeatable (e.g. --exclude ui.* or --exclude ui.*,crm.*)',
	).argParser(parsePatterns).default([]);
}

export function createNameFilter(args: { include?: string[]; exclude?: string[] }): ((name: string) => boolean) | undefined
{
	const include = args.include?.length ? args.include : null;
	const exclude = args.exclude?.length ? args.exclude : null;

	if (!include && !exclude)
	{
		return undefined;
	}

	const includeMatcher = include ? picomatch(include, { dot: true }) : null;
	const excludeMatcher = exclude ? picomatch(exclude, { dot: true }) : null;

	return (name: string) => {
		if (excludeMatcher && excludeMatcher(name))
		{
			return false;
		}

		if (includeMatcher && !includeMatcher(name))
		{
			return false;
		}

		return true;
	};
}
