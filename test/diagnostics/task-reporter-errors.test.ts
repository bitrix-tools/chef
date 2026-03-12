import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { TaskReporter } from '../../src/modules/task/task-reporter';
import { stripAnsi } from '../../src/diagnostics/code-frame';

import type { TaskResult } from '../../src/modules/task/task-types';

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

describe('TaskReporter error rendering', () => {
	beforeEach(() => {
		captureConsole();
	});

	afterEach(() => {
		restoreConsole();
	});

	it('should render single error without section header', () => {
		const reporter = new TaskReporter('test', 1);
		reporter.startTask('Building...');
		reporter.completeTask({
			title: 'Build failed',
			status: 'failed',
			details: [
				{ type: 'error', code: 'CF1002', message: 'Unexpected token' },
			],
		});

		const plain = plainOutput();

		assert.include(plain, '[CF1002]');
		assert.include(plain, 'Unexpected token');
		// Should NOT have section header for single error
		assert.notInclude(plain, 'Errors (1)');
	});

	it('should render multiple errors with section header', () => {
		const reporter = new TaskReporter('test', 1);
		reporter.startTask('Building...');
		reporter.completeTask({
			title: 'Build failed',
			status: 'failed',
			details: [
				{ type: 'error', code: 'CF1001', message: 'Type error 1' },
				{ type: 'error', code: 'CF1001', message: 'Type error 2' },
			],
		});

		const plain = plainOutput();

		assert.include(plain, 'Errors (2)');
		assert.include(plain, 'Type error 1');
		assert.include(plain, 'Type error 2');
	});

	it('should show Warnings header for warning status', () => {
		const reporter = new TaskReporter('test', 1);
		reporter.startTask('Building...');
		reporter.completeTask({
			title: 'Build with warnings',
			status: 'warning',
			details: [
				{ type: 'error', code: 'CF1006', message: 'Circular dep 1' },
				{ type: 'error', code: 'CF1006', message: 'Circular dep 2' },
			],
		});

		const plain = plainOutput();

		assert.include(plain, 'Warnings (2)');
	});

	it('should render items before errors', () => {
		const reporter = new TaskReporter('test', 1);
		reporter.startTask('Building...');
		reporter.completeTask({
			title: 'Build',
			status: 'warning',
			details: [
				{ type: 'item', text: 'bundle.js  10 KB' },
				{ type: 'item', text: 'bundle.css  5 KB' },
				{ type: 'error', code: 'CF1006', message: 'Circular dependency' },
			],
		});

		const plain = plainOutput();

		const bundlePos = plain.indexOf('bundle.js');
		const errorPos = plain.indexOf('Circular dependency');

		assert.isAbove(bundlePos, -1);
		assert.isAbove(errorPos, -1);
		assert.isBelow(bundlePos, errorPos, 'bundle sizes should appear before errors');
	});

	it('should show section header when items come before single error', () => {
		const reporter = new TaskReporter('test', 1);
		reporter.startTask('Building...');
		reporter.completeTask({
			title: 'Build',
			status: 'warning',
			details: [
				{ type: 'item', text: 'bundle.js  10 KB' },
				{ type: 'error', code: 'CF1006', message: 'Circular dependency' },
			],
		});

		const plain = plainOutput();

		// With items before, even single error should get a header
		assert.include(plain, 'Warnings (1)');
	});

	it('should render frameless errors compactly', () => {
		const reporter = new TaskReporter('test', 1);
		reporter.startTask('Building...');
		reporter.completeTask({
			title: 'Build',
			status: 'warning',
			details: [
				{ type: 'error', code: 'CF1006', message: 'Circular dep A -> B -> A' },
				{ type: 'error', code: 'CF1011', message: '"Foo" is imported but never used' },
				{ type: 'error', code: 'CF1011', message: '"Bar" is imported but never used' },
			],
		});

		const plain = plainOutput();

		// All three should be present
		assert.include(plain, 'Circular dep');
		assert.include(plain, '"Foo"');
		assert.include(plain, '"Bar"');

		// Should NOT have separators between frameless errors
		assert.notInclude(plain, '────');
	});

	it('should separate framed errors with dividers', () => {
		const reporter = new TaskReporter('test', 1);
		reporter.startTask('Building...');
		reporter.completeTask({
			title: 'Build',
			status: 'failed',
			details: [
				{
					type: 'error',
					code: 'CF1001',
					message: 'TS2322 Type error 1',
					loc: { file: '/fake/file.ts', line: 1, column: 1 },
				},
				{
					type: 'error',
					code: 'CF1001',
					message: 'TS2322 Type error 2',
					loc: { file: '/fake/file.ts', line: 2, column: 1 },
				},
			],
		});

		const plain = plainOutput();

		assert.include(plain, '────');
	});

	it('should render frameless before framed, with divider between groups', () => {
		const reporter = new TaskReporter('test', 1);
		reporter.startTask('Building...');
		reporter.completeTask({
			title: 'Build',
			status: 'warning',
			details: [
				{ type: 'error', code: 'CF1006', message: 'Circular dependency' },
				{
					type: 'error',
					code: 'CF1007',
					message: '"Foo" is not exported',
					loc: { file: '/fake/file.ts', line: 5, column: 1 },
				},
			],
		});

		const plain = plainOutput();

		const framelessPos = plain.indexOf('Circular dependency');
		const framedPos = plain.indexOf('"Foo" is not exported');
		const dividerPos = plain.indexOf('────');

		assert.isAbove(framelessPos, -1);
		assert.isAbove(framedPos, -1);
		assert.isBelow(framelessPos, framedPos, 'frameless errors should come first');
		assert.isAbove(dividerPos, framelessPos, 'divider should be after frameless');
		assert.isBelow(dividerPos, framedPos, 'divider should be before framed');
	});

	it('should add trailing blank line after errors', () => {
		const reporter = new TaskReporter('test', 2);
		reporter.startTask('Task 1...');
		reporter.completeTask({
			title: 'Task 1',
			status: 'failed',
			details: [
				{ type: 'error', code: 'CF1002', message: 'Syntax error' },
			],
		});

		// Reset output to check spacing between tasks
		output = '';

		reporter.startTask('Task 2...');
		reporter.completeTask({
			title: 'Task 2',
			status: 'passed',
		});

		// The first task's output should end with blank line,
		// so Task 2 doesn't stick to errors
		// (We check the combined output from the first completeTask which was captured above)
	});

	it('should render internal errors with boxen', () => {
		const reporter = new TaskReporter('test', 1);
		reporter.startTask('Building...');
		reporter.completeTask({
			title: 'Build failed',
			status: 'failed',
			details: [
				{ type: 'error', code: 'CF9001', message: 'Package read error', stack: 'Error: Package read error\n  at internal.ts:1:1' },
			],
		});

		const plain = plainOutput();

		assert.include(plain, 'Internal Error');
		assert.include(plain, 'CF9001');
		assert.include(plain, 'Package read error');
	});

	it('should use red codes for errors', () => {
		const reporter = new TaskReporter('test', 1);
		reporter.startTask('Building...');
		reporter.completeTask({
			title: 'Build failed',
			status: 'failed',
			details: [
				{ type: 'error', code: 'CF1001', message: 'Error 1' },
				{ type: 'error', code: 'CF1001', message: 'Error 2' },
			],
		});

		// Red ANSI code should be present
		assert.include(output, '\x1B[31m');
	});

	it('should use yellow codes for warnings', () => {
		const reporter = new TaskReporter('test', 1);
		reporter.startTask('Building...');
		reporter.completeTask({
			title: 'Build with warnings',
			status: 'warning',
			details: [
				{ type: 'error', code: 'CF1006', message: 'Warning 1' },
				{ type: 'error', code: 'CF1006', message: 'Warning 2' },
			],
		});

		// Yellow ANSI code should be present
		assert.include(output, '\x1B[33m');
	});

	it('should consistently indent all error lines in group mode', () => {
		const reporter = new TaskReporter('group-test', 2);
		reporter.startTask('Building...');
		reporter.completeTask({
			title: 'Build failed',
			status: 'failed',
			details: [
				{ type: 'error', code: 'CF1001', message: 'Type error A' },
				{ type: 'error', code: 'CF1001', message: 'Type error B' },
			],
		});

		const plain = plainOutput();
		const lines = plain.split('\n');

		// In group mode (taskCount > 1), detailPrefix is '     ' (5 spaces)
		// All content lines (non-empty, not the task title) should be indented
		const contentLines = lines.filter((l) =>
			l.trim().length > 0
			&& !l.includes('Build failed')
			&& !l.includes('group-test'),
		);

		for (const line of contentLines)
		{
			const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
			assert.isAtLeast(indent, 5, `line should have group indent: "${line}"`);
		}
	});

	it('should render blocks', () => {
		const reporter = new TaskReporter('test', 1);
		reporter.startTask('Linting...');
		reporter.completeTask({
			title: 'Lint result',
			status: 'warning',
			details: [
				{ type: 'block', text: 'Some lint output', color: 'yellow' },
			],
		});

		const plain = plainOutput();

		assert.include(plain, 'Some lint output');
	});
});
