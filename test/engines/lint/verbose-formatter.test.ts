import { describe, it } from 'mocha';
import { assert } from 'chai';

import { verboseFormatter } from '../../../src/modules/engines/lint/verbose-formatter';

import type { LintResult, LintFileResult } from '../../../src/modules/engines/lint/lint-types';

function createLintResult(files: LintFileResult[]): LintResult
{
	const errors = files.reduce((sum, f) =>
		sum + f.messages.filter((m) => m.severity === 'error').length, 0);
	const warnings = files.reduce((sum, f) =>
		sum + f.messages.filter((m) => m.severity === 'warning').length, 0);

	return {
		files,
		hasErrors: () => errors > 0,
		getErrorsCount: () => errors,
		hasWarnings: () => warnings > 0,
		getWarningsCount: () => warnings,
	};
}

describe('verboseFormatter', () => {
	it('should return succeed level when no issues', () => {
		const result = verboseFormatter(createLintResult([]));

		assert.equal(result.level, 'succeed');
		assert.equal(result.text, '');
	});

	it('should return fail level when errors exist', () => {
		const result = verboseFormatter(createLintResult([
			{
				filePath: '/project/src/app.js',
				messages: [
					{ line: 1, column: 5, severity: 'error', message: 'Unexpected var', ruleId: 'no-var' },
				],
			},
		]));

		assert.equal(result.level, 'fail');
		assert.include(result.text, 'app.js');
		assert.include(result.text, 'no-var');
		assert.include(result.text, 'Unexpected var');
	});

	it('should return warn level when only warnings', () => {
		const result = verboseFormatter(createLintResult([
			{
				filePath: '/project/src/utils.js',
				messages: [
					{ line: 10, column: 1, severity: 'warning', message: 'Missing semicolon', ruleId: 'semi' },
				],
			},
		]));

		assert.equal(result.level, 'warn');
	});

	it('should filter out files with no messages', () => {
		const result = verboseFormatter(createLintResult([
			{ filePath: '/project/src/clean.js', messages: [] },
			{
				filePath: '/project/src/dirty.js',
				messages: [
					{ line: 1, column: 1, severity: 'warning', message: 'Warning', ruleId: 'rule' },
				],
			},
		]));

		assert.notInclude(result.text, 'clean.js');
		assert.include(result.text, 'dirty.js');
	});

	it('should handle null ruleId', () => {
		const result = verboseFormatter(createLintResult([
			{
				filePath: '/project/src/app.js',
				messages: [
					{ line: 1, column: 1, severity: 'error', message: 'Parse error', ruleId: null },
				],
			},
		]));

		assert.include(result.text, 'Parse error');
	});
});
