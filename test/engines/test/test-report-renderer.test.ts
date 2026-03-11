import { describe, it } from 'mocha';
import { assert } from 'chai';

import { buildSuiteTree } from '../../../src/modules/engines/test/test-report-renderer';

import type { TestToken } from '../../../src/modules/engines/test/test-types';

describe('buildSuiteTree', () => {
	it('should build tree from empty report', () => {
		const tree = buildSuiteTree([]);

		assert.equal(tree.passed, 0);
		assert.equal(tree.failed, 0);
		assert.equal(tree.pending, 0);
		assert.deepEqual(tree.children, []);
	});

	it('should count passed tests', () => {
		const report: TestToken[] = [
			{ id: 'SUITE_START', title: 'Math', root: false },
			{ id: 'TEST_PASSED', title: 'should add', duration: 5 },
			{ id: 'TEST_PASSED', title: 'should subtract', duration: 3 },
			{ id: 'SUITE_END', root: false },
		];

		const tree = buildSuiteTree(report);

		assert.equal(tree.passed, 2);
		assert.equal(tree.failed, 0);
		assert.equal(tree.children.length, 1);
		assert.equal(tree.children[0].title, 'Math');
		assert.equal(tree.children[0].passed, 2);
		assert.equal(tree.children[0].duration, 8);
	});

	it('should count failed tests and record them', () => {
		const report: TestToken[] = [
			{ id: 'SUITE_START', title: 'Validation', root: false },
			{ id: 'TEST_FAILED', title: 'should validate', duration: 10, error: { message: 'Expected true' } },
			{ id: 'SUITE_END', root: false },
		];

		const tree = buildSuiteTree(report);

		assert.equal(tree.failed, 1);
		assert.equal(tree.children[0].failedTests.length, 1);
		assert.equal(tree.children[0].failedTests[0].title, 'should validate');
	});

	it('should count pending tests', () => {
		const report: TestToken[] = [
			{ id: 'SUITE_START', title: 'Features', root: false },
			{ id: 'TEST_PENDING', title: 'should do something' },
			{ id: 'SUITE_END', root: false },
		];

		const tree = buildSuiteTree(report);

		assert.equal(tree.pending, 1);
		assert.equal(tree.children[0].pending, 1);
	});

	it('should handle nested suites', () => {
		const report: TestToken[] = [
			{ id: 'SUITE_START', title: 'Outer', root: false },
			{ id: 'TEST_PASSED', title: 'outer test', duration: 1 },
			{ id: 'SUITE_START', title: 'Inner', root: false },
			{ id: 'TEST_PASSED', title: 'inner test', duration: 2 },
			{ id: 'TEST_FAILED', title: 'failing inner', duration: 3, error: { message: 'fail' } },
			{ id: 'SUITE_END', root: false },
			{ id: 'SUITE_END', root: false },
		];

		const tree = buildSuiteTree(report);

		assert.equal(tree.passed, 2);
		assert.equal(tree.failed, 1);

		const outer = tree.children[0];
		assert.equal(outer.title, 'Outer');
		assert.equal(outer.passed, 2);
		assert.equal(outer.failed, 1);

		const inner = outer.children[0];
		assert.equal(inner.title, 'Inner');
		assert.equal(inner.passed, 1);
		assert.equal(inner.failed, 1);
	});

	it('should ignore root suite start/end', () => {
		const report: TestToken[] = [
			{ id: 'SUITE_START', title: '', root: true },
			{ id: 'SUITE_START', title: 'Real Suite', root: false },
			{ id: 'TEST_PASSED', title: 'test', duration: 1 },
			{ id: 'SUITE_END', root: false },
			{ id: 'SUITE_END', root: true },
		];

		const tree = buildSuiteTree(report);

		assert.equal(tree.children.length, 1);
		assert.equal(tree.children[0].title, 'Real Suite');
		assert.equal(tree.passed, 1);
	});

	it('should handle multiple sibling suites', () => {
		const report: TestToken[] = [
			{ id: 'SUITE_START', title: 'Suite A', root: false },
			{ id: 'TEST_PASSED', title: 'test a', duration: 1 },
			{ id: 'SUITE_END', root: false },
			{ id: 'SUITE_START', title: 'Suite B', root: false },
			{ id: 'TEST_PASSED', title: 'test b', duration: 2 },
			{ id: 'TEST_PASSED', title: 'test c', duration: 3 },
			{ id: 'SUITE_END', root: false },
		];

		const tree = buildSuiteTree(report);

		assert.equal(tree.children.length, 2);
		assert.equal(tree.children[0].title, 'Suite A');
		assert.equal(tree.children[0].passed, 1);
		assert.equal(tree.children[1].title, 'Suite B');
		assert.equal(tree.children[1].passed, 2);
		assert.equal(tree.passed, 3);
	});

	it('should accumulate duration from children to parent', () => {
		const report: TestToken[] = [
			{ id: 'SUITE_START', title: 'Parent', root: false },
			{ id: 'SUITE_START', title: 'Child', root: false },
			{ id: 'TEST_PASSED', title: 'test', duration: 100 },
			{ id: 'SUITE_END', root: false },
			{ id: 'SUITE_END', root: false },
		];

		const tree = buildSuiteTree(report);

		assert.equal(tree.children[0].duration, 100);
		assert.equal(tree.duration, 100);
	});
});
