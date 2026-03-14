import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { lintTask } from '../../../src/shared/tasks/lint-task';
import { LintEngine } from '../../../src/modules/engines/lint/lint-engine';

import type { LintResult } from '../../../src/modules/engines/lint/lint-types';

function createMockPackage()
{
	return {
		lint: sinon.stub<any[], Promise<LintResult>>(),
	} as any;
}

function createMockLintResult(overrides: Partial<LintResult> = {}): LintResult
{
	return {
		files: [],
		hasErrors: () => false,
		getErrorsCount: () => 0,
		hasWarnings: () => false,
		getWarningsCount: () => 0,
		...overrides,
	};
}

describe('lintTask', () => {
	it('should have correct title', () => {
		const mockPackage = createMockPackage();
		const task = lintTask(mockPackage);

		assert.equal(task.title, 'Lint...');
	});

	it('should return passed status when no issues', async () => {
		const mockPackage = createMockPackage();
		mockPackage.lint.resolves(createMockLintResult());

		const task = lintTask(mockPackage);
		const result = await task.run();

		assert.equal(result.status, 'passed');
		assert.include(result.title, 'Lint:');
	});

	it('should return failed status when errors exist', async () => {
		const mockPackage = createMockPackage();
		mockPackage.lint.resolves(createMockLintResult({
			hasErrors: () => true,
			getErrorsCount: () => 3,
			hasWarnings: () => true,
			getWarningsCount: () => 1,
		}));

		const task = lintTask(mockPackage);
		const result = await task.run();

		assert.equal(result.status, 'failed');
		assert.include(result.title, '3 errors');
	});

	it('should return warning status when only warnings', async () => {
		const mockPackage = createMockPackage();
		mockPackage.lint.resolves(createMockLintResult({
			hasWarnings: () => true,
			getWarningsCount: () => 2,
		}));

		const task = lintTask(mockPackage);
		const result = await task.run();

		assert.equal(result.status, 'warning');
		assert.include(result.title, '2 warnings');
	});

	it('should return passed status with skip reason when skipped', async () => {
		const mockPackage = createMockPackage();
		mockPackage.lint.resolves(createMockLintResult({
			skipped: true,
			skipReason: 'No eslint.config.js found',
		}));

		const task = lintTask(mockPackage);
		const result = await task.run();

		assert.equal(result.status, 'passed');
		assert.include(result.title, 'No eslint.config.js found');
	});

	it('should return generic skip message when no skip reason', async () => {
		const mockPackage = createMockPackage();
		mockPackage.lint.resolves(createMockLintResult({
			skipped: true,
		}));

		const task = lintTask(mockPackage);
		const result = await task.run();

		assert.equal(result.status, 'passed');
		assert.include(result.title, 'skipped');
	});

	it('should include verbose details when verbose flag is set', async () => {
		const mockPackage = createMockPackage();
		mockPackage.lint.resolves(createMockLintResult({
			files: [
				{
					filePath: '/project/src/app.js',
					messages: [
						{ line: 1, column: 5, severity: 'error' as const, message: 'Unexpected var', ruleId: 'no-var' },
					],
				},
			],
			hasErrors: () => true,
			getErrorsCount: () => 1,
		}));

		const task = lintTask(mockPackage, { verbose: true });
		const result = await task.run();

		assert.equal(result.status, 'failed');
		assert.isDefined(result.details);
		assert.isArray(result.details);
		assert.equal(result.details![0].type, 'block');
	});

	it('should not include details when not verbose', async () => {
		const mockPackage = createMockPackage();
		mockPackage.lint.resolves(createMockLintResult({
			hasErrors: () => true,
			getErrorsCount: () => 1,
		}));

		const task = lintTask(mockPackage);
		const result = await task.run();

		assert.isUndefined(result.details);
	});
});
