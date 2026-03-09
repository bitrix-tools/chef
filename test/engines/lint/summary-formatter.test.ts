import { describe, it } from 'mocha';
import { assert } from 'chai';

import { summaryFormatter } from '../../../src/modules/engines/lint/summary-formatter';
import type { LintResult } from '../../../src/modules/engines/lint/lint-types';

function createLintResult(errors: number, warnings: number): LintResult
{
	return {
		files: [],
		hasErrors: () => errors > 0,
		getErrorsCount: () => errors,
		hasWarnings: () => warnings > 0,
		getWarningsCount: () => warnings,
	};
}

describe('summaryFormatter', () => {
	it('should return succeed level when no issues', () => {
		const result = summaryFormatter(createLintResult(0, 0));

		assert.equal(result.level, 'succeed');
		assert.include(result.title, '0 errors');
		assert.include(result.title, '0 warnings');
	});

	it('should return fail level when errors exist', () => {
		const result = summaryFormatter(createLintResult(3, 2));

		assert.equal(result.level, 'fail');
		assert.include(result.title, '3 errors');
		assert.include(result.title, '2 warnings');
	});

	it('should return warn level when only warnings exist', () => {
		const result = summaryFormatter(createLintResult(0, 5));

		assert.equal(result.level, 'warn');
		assert.include(result.title, '5 warnings');
	});

	it('should use singular form for 1 error', () => {
		const result = summaryFormatter(createLintResult(1, 0));

		assert.include(result.title, '1 error');
		assert.notInclude(result.title, '1 errors');
	});

	it('should use singular form for 1 warning', () => {
		const result = summaryFormatter(createLintResult(0, 1));

		assert.include(result.title, '1 warning');
		assert.notInclude(result.title, '1 warnings');
	});
});
