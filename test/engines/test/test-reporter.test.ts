import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { TestReporter, stripAnsi, hasLocalFilePath } from '../../../src/modules/engines/test/test-reporter';
import type { TestToken } from '../../../src/modules/engines/test/test-types';

describe('stripAnsi', () => {
	it('should remove ANSI color codes', () => {
		assert.equal(stripAnsi('\x1B[31mred\x1B[0m'), 'red');
	});

	it('should return plain text unchanged', () => {
		assert.equal(stripAnsi('hello world'), 'hello world');
	});

	it('should handle multiple codes', () => {
		assert.equal(stripAnsi('\x1B[1m\x1B[32mgreen bold\x1B[0m'), 'green bold');
	});
});

describe('hasLocalFilePath', () => {
	it('should return true for local file path', () => {
		assert.isTrue(hasLocalFilePath('at /src/app.ts:10:5'));
	});

	it('should return false for CDN path', () => {
		assert.isFalse(hasLocalFilePath('at //cdn.jsdelivr.net/foo.js:1:1'));
	});

	it('should return true for path inside URL (function only filters CDN/protocol prefixes)', () => {
		// hasLocalFilePath only filters //cdn... and ://... paths, not full URLs
		assert.isTrue(hasLocalFilePath('at http://localhost:3000/app.js:1:1'));
	});

	it('should return false for undefined', () => {
		assert.isFalse(hasLocalFilePath(undefined));
	});

	it('should return false for empty string', () => {
		assert.isFalse(hasLocalFilePath(''));
	});

	it('should return false for stack without file paths', () => {
		assert.isFalse(hasLocalFilePath('Error: something went wrong'));
	});
});

describe('TestReporter', () => {
	let originalWrite: typeof process.stdout.write;
	let output: string;

	beforeEach(() => {
		originalWrite = process.stdout.write;
		output = '';
		process.stdout.write = ((chunk: any) => {
			output += String(chunk);
			return true;
		}) as any;
	});

	afterEach(() => {
		process.stdout.write = originalWrite;
	});

	function createReporter(browserCount = 1): TestReporter
	{
		const reporter = new TestReporter();
		reporter.setBrowserCount(browserCount);
		// Stop spinner to avoid async writes
		reporter.stop();
		return reporter;
	}

	describe('handleToken — counting', () => {
		it('should count passed tests', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_PASSED', title: 'test 1', suite: ['Suite'], duration: 5 });
			reporter.handleToken({ id: 'TEST_PASSED', title: 'test 2', suite: ['Suite'], duration: 3 });

			const { passed, failed } = reporter.finish();

			assert.equal(passed, 2);
			assert.equal(failed, 0);
		});

		it('should count failed tests', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_FAILED', title: 'test 1', suite: ['Suite'], duration: 5, error: { message: 'fail' } });

			const { passed, failed } = reporter.finish();

			assert.equal(passed, 0);
			assert.equal(failed, 1);
		});

		it('should count pending tests', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_PENDING', title: 'test 1', suite: ['Suite'] });

			const { passed, failed } = reporter.finish();

			assert.equal(passed, 0);
			assert.equal(failed, 0);
		});

		it('should count mixed results', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_PASSED', title: 'pass', suite: ['S'], duration: 1 });
			reporter.handleToken({ id: 'TEST_FAILED', title: 'fail', suite: ['S'], duration: 2, error: { message: 'err' } });
			reporter.handleToken({ id: 'TEST_PENDING', title: 'skip', suite: ['S'] });

			const { passed, failed } = reporter.finish();

			assert.equal(passed, 1);
			assert.equal(failed, 1);
		});
	});

	describe('handleToken — multi-browser deduplication', () => {
		it('should not double-count same test from different browsers', () => {
			const reporter = createReporter(3);

			reporter.handleToken({ id: 'TEST_PASSED', title: 'test', suite: ['S'], duration: 1 }, 'Chromium');
			reporter.handleToken({ id: 'TEST_PASSED', title: 'test', suite: ['S'], duration: 1 }, 'Firefox');
			reporter.handleToken({ id: 'TEST_PASSED', title: 'test', suite: ['S'], duration: 1 }, 'WebKit');

			const { passed, failed } = reporter.finish();

			assert.equal(passed, 1);
			assert.equal(failed, 0);
		});

		it('should upgrade to failed if any browser fails', () => {
			const reporter = createReporter(2);

			reporter.handleToken({ id: 'TEST_PASSED', title: 'test', suite: ['S'], duration: 1 }, 'Chromium');
			reporter.handleToken({ id: 'TEST_FAILED', title: 'test', suite: ['S'], duration: 1, error: { message: 'fail' } }, 'Firefox');

			const { passed, failed } = reporter.finish();

			assert.equal(passed, 0);
			assert.equal(failed, 1);
		});

		it('should count different tests separately', () => {
			const reporter = createReporter(2);

			reporter.handleToken({ id: 'TEST_PASSED', title: 'test 1', suite: ['S'], duration: 1 }, 'Chromium');
			reporter.handleToken({ id: 'TEST_PASSED', title: 'test 2', suite: ['S'], duration: 1 }, 'Chromium');
			reporter.handleToken({ id: 'TEST_PASSED', title: 'test 1', suite: ['S'], duration: 1 }, 'Firefox');
			reporter.handleToken({ id: 'TEST_PASSED', title: 'test 2', suite: ['S'], duration: 1 }, 'Firefox');

			const { passed, failed } = reporter.finish();

			assert.equal(passed, 2);
			assert.equal(failed, 0);
		});
	});

	describe('handleToken — suite stacks', () => {
		it('should track suite path via SUITE_START/END', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'SUITE_START', title: 'Outer', root: false });
			reporter.handleToken({ id: 'SUITE_START', title: 'Inner', root: false });
			reporter.handleToken({ id: 'TEST_PASSED', title: 'deep test', duration: 1 });
			reporter.handleToken({ id: 'SUITE_END', root: false });
			reporter.handleToken({ id: 'SUITE_END', root: false });

			const { passed } = reporter.finish();

			assert.equal(passed, 1);
			// The full path "Outer > Inner > deep test" should appear in output
			assert.include(output, 'Outer > Inner > deep test');
		});

		it('should ignore root suite', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'SUITE_START', title: '', root: true });
			reporter.handleToken({ id: 'TEST_PASSED', title: 'test', duration: 1 });
			reporter.handleToken({ id: 'SUITE_END', root: true });

			const { passed } = reporter.finish();

			assert.equal(passed, 1);
		});
	});

	describe('handleToken — failed test grouping by browser', () => {
		it('should group same failure across browsers in finish output', () => {
			const reporter = createReporter(3);

			const token: TestToken = { id: 'TEST_FAILED', title: 'broken', suite: ['S'], duration: 1, error: { message: 'oops' } };
			reporter.handleToken(token, 'Chromium');
			reporter.handleToken(token, 'Firefox');
			reporter.handleToken(token, 'WebKit');

			output = '';
			reporter.finish();

			// Should group browsers together
			assert.include(output, 'Chromium');
			assert.include(output, 'Firefox');
			assert.include(output, 'WebKit');
			// Should only have 1 failed test section
			assert.include(output, 'Failed Tests (1)');
		});
	});

	describe('finish output', () => {
		it('should include summary with counts', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_PASSED', title: 'p1', suite: ['S'], duration: 1 });
			reporter.handleToken({ id: 'TEST_PASSED', title: 'p2', suite: ['S'], duration: 1 });
			reporter.handleToken({ id: 'TEST_FAILED', title: 'f1', suite: ['S'], duration: 1, error: { message: 'err' } });

			output = '';
			reporter.finish();

			const plain = stripAnsi(output);
			assert.include(plain, '2 passed');
			assert.include(plain, '1 failed');
			assert.include(plain, '(3)');
		});

		it('should include browser names', () => {
			const reporter = createReporter(2);

			reporter.handleToken({ id: 'TEST_PASSED', title: 'test', suite: ['S'], duration: 1 }, 'Chromium');
			reporter.handleToken({ id: 'TEST_PASSED', title: 'test', suite: ['S'], duration: 1 }, 'Firefox');

			output = '';
			reporter.finish();

			const plain = stripAnsi(output);
			assert.include(plain, 'Browsers');
			assert.include(plain, 'Chromium');
			assert.include(plain, 'Firefox');
		});

		it('should include error details for failed tests', () => {
			const reporter = createReporter();

			reporter.handleToken({
				id: 'TEST_FAILED',
				title: 'broken test',
				suite: ['Suite'],
				duration: 5,
				error: { message: 'expected true to be false' },
			});

			output = '';
			reporter.finish();

			const plain = stripAnsi(output);
			assert.include(plain, 'expected true to be false');
		});

		it('should include console logs', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_PASSED', title: 'test', suite: ['S'], duration: 1 });

			output = '';
			reporter.finish([
				{ type: 'log', text: 'debug info' },
				{ type: 'error', text: 'some error' },
			]);

			const plain = stripAnsi(output);
			assert.include(plain, 'Console output');
			assert.include(plain, 'debug info');
			assert.include(plain, 'some error');
		});
	});
});
