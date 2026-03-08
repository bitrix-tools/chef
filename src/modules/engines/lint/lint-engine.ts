import type { LintStrategy } from './lint-strategy';
import type { LintOptions, LintResult } from './lint-types';

export class LintEngine
{
	protected readonly strategy: LintStrategy;

	constructor(strategy: LintStrategy)
	{
		this.strategy = strategy;
	}

	async lint(options: LintOptions): Promise<LintResult>
	{
		return this.strategy.lint(options);
	}
}
