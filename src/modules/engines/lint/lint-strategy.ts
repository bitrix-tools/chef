import type { LintOptions, LintResult } from './lint-types';

export abstract class LintStrategy
{
	abstract lint(options: LintOptions): Promise<LintResult>;
}
