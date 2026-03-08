import type { LintResult, LintFormatterLevel } from './lint-types';
import { pluralize } from '../../../utils/pluralize';

export function summaryFormatter(result: LintResult): { title: string; text: string; level: LintFormatterLevel }
{
	if (result.hasErrors())
	{
		return {
			level: 'fail',
			title: `ESLint: Found ${pluralize(' error', result.getErrorsCount())} and ${pluralize(' warning', result.getWarningsCount())}.`,
			text: '',
		};
	}

	if (result.hasWarnings())
	{
		return {
			level: 'warn',
			title: `ESLint: Found ${pluralize(' warning', result.getWarningsCount())}.`,
			text: '',
		};
	}

	return {
		title: 'Eslint: All clean (0 errors, 0 warnings)',
		level: 'succeed',
		text: '',
	};
}
