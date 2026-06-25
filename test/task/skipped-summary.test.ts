import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { printSummary } from '../../src/shared/print-summary';
import { TaskReporter } from '../../src/modules/task/task-reporter';
import { stripAnsi } from '../../src/diagnostics/code-frame';

import type { TaskGroupResult } from '../../src/modules/task/task-types';

let originalLog: typeof console.log;
let output: string;

function captureConsole(): void
{
	originalLog = console.log;
	output = '';
	console.log = (...args: any[]) => {
		output += args.map(String).join(' ') + '\n';
	};
}

function restoreConsole(): void
{
	console.log = originalLog;
}

function plainOutput(): string
{
	return stripAnsi(output);
}

function group(overrides: Partial<TaskGroupResult>): TaskGroupResult
{
	return {
		title: 'group',
		results: [],
		passed: 0,
		failed: 0,
		warnings: 0,
		skipped: 0,
		duration: 1,
		...overrides,
	};
}

describe('TaskReporter skipped tally', () => {
	beforeEach(captureConsole);
	afterEach(restoreConsole);

	it('counts a skipped task in the group result', () => {
		const reporter = new TaskReporter('crm', 1);
		reporter.startTask('E2E tests...');
		reporter.completeTask({ title: 'E2E tests (no test files)', status: 'skipped' });

		const result = reporter.finish();

		assert.equal(result.skipped, 1);
		assert.equal(result.passed, 0);
		assert.equal(result.failed, 0);
	});
});

describe('printSummary skipped classification', () => {
	beforeEach(captureConsole);
	afterEach(restoreConsole);

	it('reports a no-tests group as skipped, not passed', () => {
		const results = [group({ title: 'crm', skipped: 1 })];

		printSummary(results, Date.now(), { isTestRun: true, unitLabel: 'Modules' });

		const plain = plainOutput();
		assert.include(plain, 'Modules');
		assert.include(plain, '1 skipped');
		assert.notInclude(plain, 'passed');
	});

	it('keeps passed and skipped groups separate in a mixed run', () => {
		const results = [
			group({ title: 'crm', skipped: 1 }),
			group({ title: 'ui', passed: 1, results: [{ title: 'E2E tests', status: 'passed', metrics: { passed: 4, failed: 0 } }] }),
		];

		printSummary(results, Date.now(), { isTestRun: true, unitLabel: 'Modules' });

		const plain = plainOutput();
		assert.include(plain, '1 passed');
		assert.include(plain, '1 skipped');
		assert.include(plain, '(2)');
		// The tests line aggregates the real test count from metrics.
		assert.include(plain, '4 passed');
	});

	it('does not count a failed group as skipped', () => {
		const results = [group({ title: 'crm', failed: 1 })];

		printSummary(results, Date.now(), { isTestRun: true, unitLabel: 'Modules' });

		const plain = plainOutput();
		assert.include(plain, '1 failed');
		assert.notInclude(plain, 'skipped');
	});

	it('still reports a fully passing run as passed', () => {
		const results = [
			group({ title: 'ui', passed: 1, results: [{ title: 'E2E tests', status: 'passed', metrics: { passed: 2, failed: 0 } }] }),
		];

		printSummary(results, Date.now(), { isTestRun: true, unitLabel: 'Modules' });

		const plain = plainOutput();
		assert.include(plain, '1 passed');
		assert.notInclude(plain, 'skipped');
	});
});
