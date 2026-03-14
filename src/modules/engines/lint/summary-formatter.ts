import { pluralize } from '../../../utils/pluralize';

import type { LintResult, LintFormatterLevel } from './lint-types';

export function summaryFormatter(result: LintResult): { title: string; text: string; level: LintFormatterLevel }
{
	if (result.hasErrors())
	{
		return {
			level: 'fail',
			title: `Lint: Found ${pluralize(' error', result.getErrorsCount())} and ${pluralize(' warning', result.getWarningsCount())}.`,
			text: '',
		};
	}

	if (result.hasWarnings())
	{
		return {
			level: 'warn',
			title: `Lint: Found ${pluralize(' warning', result.getWarningsCount())}.`,
			text: '',
		};
	}

	return {
		title: 'Lint: All clean (0 errors, 0 warnings)',
		level: 'succeed',
		text: '',
	};
}
