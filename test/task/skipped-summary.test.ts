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

// The per-extension summary is suppressed in a real run (showSummary: false), so this is
// the summary the CLI actually prints — for `chef test`, `chef test e2e` and `chef test
// module` alike, since they all funnel through printSummary.
describe('printSummary — flaky and unreported tests', () => {
	beforeEach(captureConsole);
	afterEach(restoreConsole);

	it('names the flaky tests and warns that a retried baseline proves nothing', () => {
		const results = [
			group({
				title: 'bizproc',
				passed: 1,
				results: [{
					title: 'E2E tests',
					status: 'passed',
					metrics: {
						passed: 11,
						failed: 0,
						flaky: 2,
						flakyTests: ['start dialog > names the slider', 'template list > opens on own templates'],
					},
				}],
			}),
		];

		printSummary(results, Date.now(), { isTestRun: true, unitLabel: 'Modules' });

		const plain = plainOutput();
		// The count sits outside the (N) total — flaky tests are already inside `passed`.
		assert.include(plain, '11 passed');
		assert.include(plain, '2 flaky');
		assert.include(plain, '(11)');
		// Named, and prefixed with the extension they came from.
		assert.include(plain, 'Flaky tests:');
		assert.include(plain, 'bizproc');
		assert.include(plain, 'names the slider');
		// And the reason a retried green is weaker evidence than it looks.
		assert.include(plain, '--ignore-snapshots');
	});

	it('does not mention flaky tests when nothing was retried', () => {
		const results = [
			group({ title: 'ui', passed: 1, results: [{ title: 'E2E tests', status: 'passed', metrics: { passed: 3, failed: 0, flaky: 0, flakyTests: [] } }] }),
		];

		printSummary(results, Date.now(), { isTestRun: true, unitLabel: 'Modules' });

		const plain = plainOutput();
		assert.notInclude(plain, 'flaky');
		assert.notInclude(plain, '--ignore-snapshots');
	});

	it('reports selected tests that produced no result', () => {
		const results = [
			group({ title: 'ui', failed: 1, results: [{ title: 'E2E tests (5 unreported)', status: 'failed', metrics: { passed: 6, failed: 0, unreported: 5 } }] }),
		];

		printSummary(results, Date.now(), { isTestRun: true, unitLabel: 'Modules' });

		const plain = plainOutput();
		// A green "6 passed" alone would pass for a full run of the selected set.
		assert.include(plain, '6 passed');
		assert.include(plain, 'Mismatch');
		assert.include(plain, '5 unreported');
	});

	it('sums flaky and unreported counts across extensions', () => {
		const results = [
			group({ title: 'crm', passed: 1, results: [{ title: 'E2E tests', status: 'passed', metrics: { passed: 4, failed: 0, flaky: 1, flakyTests: ['a > one'], unreported: 2 } }] }),
			group({ title: 'ui', passed: 1, results: [{ title: 'E2E tests', status: 'passed', metrics: { passed: 5, failed: 0, flaky: 2, flakyTests: ['b > two', 'b > three'], unreported: 3 } }] }),
		];

		printSummary(results, Date.now(), { isTestRun: true, unitLabel: 'Modules' });

		const plain = plainOutput();
		assert.include(plain, '3 flaky');
		assert.include(plain, '5 unreported');
		// Every flaky test is listed, each under the extension it came from.
		assert.include(plain, 'crm');
		assert.include(plain, 'ui');
		assert.include(plain, 'b > three');
	});
});
