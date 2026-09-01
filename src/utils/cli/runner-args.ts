/**
 * Routing of unknown command-line options to the Playwright runner.
 *
 * chef deliberately does not re-declare Playwright's whole CLI: it owns the options that
 * shape its own behaviour (--watch, --console, --reporter …) and hands everything else to
 * the runner. That way an option Playwright gained in its latest release works the day it
 * ships, without a chef update — which is exactly what a hard-coded list cannot give.
 *
 * The options below are only needed to parse the command line correctly: an option that
 * takes a value consumes the next argument, so `--repeat-each 3` must not leave a stray
 * "3" behind to be mistaken for an extension name. Options missing from this list still
 * reach Playwright — they are just assumed to be flags, which is right for anything
 * written as `--option=value`.
 */
const PLAYWRIGHT_VALUE_OPTIONS = new Set([
	'--browser',
	'--config', '-c',
	'--global-timeout',
	'--grep-invert',
	'--max-failures',
	'--output',
	'--repeat-each',
	'--retries',
	'--shard',
	'--test-list',
	'--test-list-invert',
	'--timeout',
	'--trace',
	'--tsconfig',
	'--ui-host',
	'--ui-port',
	'--update-source-method',
	'--workers', '-j',
]);

/**
 * Options chef handles itself. Everything here is consumed by chef's own parser and must
 * never be routed to the runner — either because chef acts on it (--watch, --console) or
 * because chef translates it into runner arguments of its own (--project, --grep, --list).
 *
 * --reporter is the notable one: chef always runs Playwright with its own streaming
 * reporter, which its entire live output is built on. Letting a user's --reporter through
 * would silence chef's output completely, so it stays chef's (it selects chef's reporter:
 * default/json/teamcity).
 */
const CHEF_OPTIONS = new Set([
	'--watch', '-w',
	'--path', '-p',
	'--headed',
	'--debug',
	'--grep',
	'--project',
	'--reporter',
	'--console',
	'--cdp-port',
	'--list',
	'--help', '-h',
]);

function optionName(argument: string): string
{
	const equals = argument.indexOf('=');

	return equals === -1 ? argument : argument.slice(0, equals);
}

function isOption(argument: string): boolean
{
	return argument.startsWith('-') && argument !== '-';
}

/**
 * Split a raw argument list into what chef parses and what goes to Playwright.
 *
 * Only options chef does not own are routed; positional arguments (extension names, a
 * test file) always stay with chef. An unknown option is assumed to be Playwright's —
 * chef cannot tell a new runner option from a typo, and the runner reports the typo with
 * a better message than "unknown option" from chef would be.
 */
export function routeRunnerArgs(argv: string[]): { chefArgs: string[]; runnerArgs: string[] }
{
	const chefArgs: string[] = [];
	const runnerArgs: string[] = [];

	for (let index = 0; index < argv.length; index++)
	{
		const argument = argv[index];

		if (!isOption(argument))
		{
			chefArgs.push(argument);
			continue;
		}

		const name = optionName(argument);
		if (CHEF_OPTIONS.has(name))
		{
			chefArgs.push(argument);
			continue;
		}

		runnerArgs.push(argument);

		// A value written as `--option value` lives in the next argument. Move it across
		// too, so it is not left behind and read as an extension name.
		if (PLAYWRIGHT_VALUE_OPTIONS.has(name) && !argument.includes('=') && index + 1 < argv.length)
		{
			const value = argv[index + 1];
			if (!isOption(value))
			{
				runnerArgs.push(value);
				index++;
			}
		}
	}

	return { chefArgs, runnerArgs };
}
