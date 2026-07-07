/**
 * The `--console [target]` option selects which test output to print:
 *   - browser: the in-page console (unit tests run in the browser)
 *   - node:    the Node-side stdout of the test process (e2e specs run in Node)
 *   - all:     both
 * A bare `--console` (Commander yields `true`) means `browser`, matching the historical
 * behavior before the option took a value.
 */
export type ConsoleTarget = 'browser' | 'node' | 'all';

const VALID_TARGETS: ConsoleTarget[] = ['browser', 'node', 'all'];

export function parseConsoleTarget(value: unknown): ConsoleTarget | null
{
	if (value === undefined || value === false)
	{
		return null;
	}

	// Bare `--console` → historical "browser console" behavior.
	if (value === true)
	{
		return 'browser';
	}

	if (typeof value === 'string' && (VALID_TARGETS as string[]).includes(value))
	{
		return value as ConsoleTarget;
	}

	return null;
}

export function isValidConsoleValue(value: unknown): boolean
{
	// Absent or bare flag are both fine; only an explicit unknown string is invalid.
	return value === undefined || value === true || value === false || parseConsoleTarget(value) !== null;
}

export function consoleTargetValues(): string
{
	return VALID_TARGETS.join(', ');
}

/** Whether the browser console should be printed for the given raw `--console` value. */
export function showsBrowserConsole(value: unknown): boolean
{
	const target = parseConsoleTarget(value);

	return target === 'browser' || target === 'all';
}

/** Whether the Node-side stdout should be printed for the given raw `--console` value. */
export function showsNodeOutput(value: unknown): boolean
{
	const target = parseConsoleTarget(value);

	return target === 'node' || target === 'all';
}
