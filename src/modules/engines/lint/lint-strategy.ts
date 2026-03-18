import type { LintOptions, LintResult } from './lint-types';

export abstract class LintStrategy
{
	abstract match(options: LintOptions): boolean;
	abstract lint(options: LintOptions): Promise<LintResult>;
}
