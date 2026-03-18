import type { LintStrategy } from './lint-strategy';
import type { LintOptions, LintResult } from './lint-types';

export class LintEngine
{
	readonly #strategies: LintStrategy[];

	constructor(strategies: LintStrategy[])
	{
		this.#strategies = strategies;
	}

	async lint(options: LintOptions): Promise<LintResult>
	{
		const strategy = this.#strategies.find((s) => s.match(options));

		if (!strategy)
		{
			return {
				files: [],
				skipped: true,
				skipReason: 'No matching lint strategy found',
				hasErrors: () => false,
				getErrorsCount: () => 0,
				hasWarnings: () => false,
				getWarningsCount: () => 0,
			};
		}

		return strategy.lint(options);
	}
}
