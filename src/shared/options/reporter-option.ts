import { Option } from 'commander';

export type ReporterName = 'default' | 'json' | 'teamcity';

/**
 * Creates a `--reporter` option. Each command picks the set of reporters it
 * actually supports (e.g. `chef test` adds `teamcity`); other commands accept
 * only `default` and `json`.
 */
export function createReporterOption(choices: readonly ReporterName[] = ['default', 'json']): Option
{
	return new Option('--reporter <name>', 'Output format')
		.choices([...choices])
		.default('default');
}
