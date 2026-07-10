import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { TestReporter, stripAnsi, hasLocalFilePath, truncateToWidth } from '../../../src/modules/engines/test/test-reporter';

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

describe('truncateToWidth', () => {
	it('leaves a line that fits untouched', () => {
		assert.equal(truncateToWidth('short line', 80), 'short line');
	});

	it('clips a line wider than the terminal and adds an ellipsis', () => {
		const result = truncateToWidth('a'.repeat(100), 10);
		// 9 visible chars + ellipsis, plus a trailing reset.
		assert.equal(stripAnsi(result), 'aaaaaaaaa…');
	});

	it('counts only visible width, preserving ANSI color codes', () => {
		const colored = '\x1B[31m' + 'x'.repeat(50) + '\x1B[0m';
		const result = truncateToWidth(colored, 6);
		// The color code carries no width; 5 visible chars fit before the ellipsis.
		assert.equal(stripAnsi(result), 'xxxxx…');
		assert.include(result, '\x1B[31m');
	});

	it('does not cut in the middle of an ANSI escape sequence', () => {
		const colored = '\x1B[32mgreen text here\x1B[0m';
		const result = truncateToWidth(colored, 5);
		// Whatever is kept must still strip cleanly (no broken "[32" leaking through).
		assert.equal(stripAnsi(result), 'gree…');
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

		it('tags a test with every browser even when they report out of order (parallel unit)', () => {
			const reporter = createReporter(3);
			reporter.setBrowsers(['Chromium', 'Firefox', 'WebKit']);

			// Unit runs browsers in parallel, so results arrive interleaved and out of order.
			reporter.handleToken({ id: 'TEST_PASSED', title: 't', suite: ['S'], duration: 1, browser: 'WebKit' }, 'WebKit');
			reporter.handleToken({ id: 'TEST_PASSED', title: 't', suite: ['S'], duration: 1, browser: 'Chromium' }, 'Chromium');
			reporter.handleToken({ id: 'TEST_PASSED', title: 't', suite: ['S'], duration: 1, browser: 'Firefox' }, 'Firefox');

			const plain = stripAnsi(reporter.formatGroupedResults());
			// The grouped line carries all three engines, ordered by the run's browser order.
			assert.match(plain, /Chromium ✓ · Firefox ✓ · WebKit ✓/);
			// One line for the test, not three.
			assert.equal(plain.match(/✓ t/g)?.length, 1);
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

		it('prints per-test attachments grouped by browser, with clickable `at` paths', () => {
			const reporter = createReporter(2);

			reporter.handleToken(
				{
					id: 'TEST_FAILED', title: 'broken', suite: ['S'], duration: 1,
					error: { message: 'oops' },
					attachments: [
						{ name: 'screenshot', contentType: 'image/png', path: '/tmp/cr/test-failed-1.png' },
						{ name: 'trace', contentType: 'application/zip', path: '/tmp/cr/trace.zip' },
					],
				},
				'Chromium',
			);
			reporter.handleToken(
				{
					id: 'TEST_FAILED', title: 'broken', suite: ['S'], duration: 1,
					error: { message: 'oops' },
					attachments: [
						{ name: 'screenshot', contentType: 'image/png', path: '/tmp/ff/test-failed-1.png' },
					],
				},
				'Firefox',
			);

			output = '';
			reporter.finish();

			const plain = stripAnsi(output);
			// Grouped per browser, artifact name, and a clickable `at <path>` line.
			assert.include(plain, 'screenshot');
			assert.include(plain, 'at /tmp/cr/test-failed-1.png');
			assert.include(plain, 'at /tmp/cr/trace.zip');
			assert.include(plain, 'at /tmp/ff/test-failed-1.png');
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
			reporter.finish({
				consoleLogs: [
					{ type: 'log', text: 'debug info' },
					{ type: 'error', text: 'some error' },
				],
			});

			const plain = stripAnsi(output);
			assert.include(plain, 'Console output');
			assert.include(plain, 'debug info');
			assert.include(plain, 'some error');
		});

		it('marks each Node message with a delimiter and keeps repeats verbatim', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_PASSED', title: 'test', suite: ['S'], duration: 1 });

			output = '';
			reporter.finish({
				nodeOutput: [{
					messages: ['первое сообщение', 'повтор', 'повтор'],
				}],
			});

			const plain = stripAnsi(output);
			assert.include(plain, 'Node output');
			assert.include(plain, 'первое сообщение');
			// Each message is delimited with a marker — one per message, not merged.
			assert.equal(plain.split('›').length - 1, 3, 'one marker per message');
			// Verbatim: the repeated message is kept, not collapsed with a ×N counter.
			assert.equal(plain.split('повтор').length - 1, 2, 'repeated messages are printed as-is');
		});

		it('indents continuation lines of a multi-line message under its marker', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_PASSED', title: 'test', suite: ['S'], duration: 1 });

			output = '';
			reporter.finish({
				nodeOutput: [{ messages: ['первая строка\nвторая строка'] }],
			});

			const plain = stripAnsi(output);
			// A single multi-line message carries exactly one marker.
			assert.equal(plain.split('›').length - 1, 1, 'multi-line message has one marker');
			assert.include(plain, 'первая строка');
			assert.include(plain, 'вторая строка');
		});

		it('groups Node output by browser with a header per engine', () => {
			const reporter = createReporter(2);

			reporter.handleToken({ id: 'TEST_PASSED', title: 'test', suite: ['S'], duration: 1 });

			output = '';
			reporter.finish({
				nodeOutput: [
					{ browser: 'Chromium', messages: ['из chromium'] },
					{ browser: 'Firefox', messages: ['из firefox'] },
				],
			});

			const plain = stripAnsi(output);
			assert.include(plain, 'Chromium');
			assert.include(plain, 'Firefox');
			assert.include(plain, 'из chromium');
			assert.include(plain, 'из firefox');
		});

		it('does not print a Node output block when there is no node output', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_PASSED', title: 'test', suite: ['S'], duration: 1 });

			output = '';
			reporter.finish({});

			assert.notInclude(stripAnsi(output), 'Node output');
		});
	});

	describe('grouped results (final reprint)', () => {
		it('prints each suite path once as a heading, tests indented beneath it', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_PASSED', title: 'first', suite: ['Group', 'Nested'], duration: 1 });
			reporter.handleToken({ id: 'TEST_PASSED', title: 'second', suite: ['Group', 'Nested'], duration: 1 });
			reporter.handleToken({ id: 'TEST_PASSED', title: 'other', suite: ['Group', 'Other'], duration: 1 });

			const plain = stripAnsi(reporter.formatGroupedResults());

			// The suite path is a heading, printed once — not repeated on every test line.
			assert.include(plain, 'Group > Nested');
			assert.include(plain, 'Group > Other');
			assert.equal(plain.match(/Group > Nested/g)?.length, 1, 'suite heading appears once');
			// Test lines carry only the title, not the full path.
			assert.match(plain, /✓ first/);
			assert.notMatch(plain, /Group > Nested > first/);
		});

		it('collapses a test run in several browsers into one line with all engines', () => {
			const reporter = createReporter(2);
			reporter.setBrowsers(['Chromium', 'Firefox']);

			// Same test reported by two engines (as multi-browser runs do).
			reporter.handleToken({ id: 'TEST_PASSED', title: 't', suite: ['S'], duration: 1, browser: 'Chromium' }, 'Chromium');
			reporter.handleToken({ id: 'TEST_PASSED', title: 't', suite: ['S'], duration: 1, browser: 'Firefox' }, 'Firefox');

			const plain = stripAnsi(reporter.formatGroupedResults());

			// One line for the test, tagged with both engines — not two separate lines.
			assert.equal(plain.match(/✓ t/g)?.length, 1, 'test appears once');
			assert.include(plain, 'Chromium');
			assert.include(plain, 'Firefox');
		});

		it('marks a failed test with ✗ and a skipped one as skipped', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_PASSED', title: 'ok', suite: ['S'], duration: 1 });
			reporter.handleToken({ id: 'TEST_FAILED', title: 'bad', suite: ['S'], duration: 1, error: { message: 'boom' } });
			reporter.handleToken({ id: 'TEST_PENDING', title: 'later', suite: ['S'] });

			const plain = stripAnsi(reporter.formatGroupedResults());

			assert.match(plain, /✓ ok/);
			assert.match(plain, /✗ bad/);
			assert.match(plain, /○ later\s+skipped/);
		});
	});

	describe('retries', () => {
		it('marks a flaky test (passed after retries) with the attempt it passed on', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_PASSED', title: 'flaky', suite: ['S'], duration: 5, retries: 2 });

			const plain = stripAnsi(reporter.formatGroupedResults());
			// retries=2 → 3 attempts, passed on the third.
			assert.match(plain, /flaky.*passed on attempt 3/);
		});

		it('marks a test that kept failing across retries with the attempt count', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_FAILED', title: 'broken', suite: ['S'], duration: 5, retries: 3, error: { message: 'x' } });

			const plain = stripAnsi(reporter.formatGroupedResults());
			// retries=3 → 4 attempts, still failing.
			assert.match(plain, /broken.*failed after 4 attempts/);
		});

		it('does not add a retry note to a test that ran once', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_PASSED', title: 'once', suite: ['S'], duration: 1 });

			const plain = stripAnsi(reporter.formatGroupedResults());
			assert.notMatch(plain, /attempt|retried/);
		});

		it('marks browsers that have not reported a test yet as running in live mode', () => {
			const reporter = createReporter(3);
			reporter.setBrowsers(['Chromium', 'Firefox', 'WebKit']);

			// Only Chromium has reported this test so far.
			reporter.handleToken({ id: 'TEST_PASSED', title: 't', suite: ['S'], duration: 1, browser: 'Chromium' }, 'Chromium');

			const live = stripAnsi(reporter.formatGroupedResults(true));
			// Finished engine keeps its outcome; the others show as running (◌).
			assert.match(live, /Chromium ✓/);
			assert.match(live, /Firefox ◌/);
			assert.match(live, /WebKit ◌/);

			// The final report (default) never shows running — only the outcome that arrived.
			const final = stripAnsi(reporter.formatGroupedResults());
			assert.notInclude(final, '◌');
			assert.match(final, /Chromium ✓/);
		});

		it('does not count a test that failed after all retries as flaky', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_FAILED', title: 'broken', suite: ['S'], duration: 5, retries: 3, error: { message: 'x' } });

			const { flaky } = reporter.finish();
			// Retried but never passed — that's a failure, not a flaky test.
			assert.equal(flaky, 0);
		});

		it('counts flaky tests once across browsers in the finish result', () => {
			const reporter = createReporter(2);
			reporter.setBrowsers(['Chromium', 'Firefox']);

			// Same flaky test retried in both browsers — counts once.
			reporter.handleToken({ id: 'TEST_PASSED', title: 'flaky', suite: ['S'], duration: 5, retries: 1, browser: 'Chromium' }, 'Chromium');
			reporter.handleToken({ id: 'TEST_PASSED', title: 'flaky', suite: ['S'], duration: 5, retries: 1, browser: 'Firefox' }, 'Firefox');
			reporter.handleToken({ id: 'TEST_PASSED', title: 'stable', suite: ['S'], duration: 1, browser: 'Chromium' }, 'Chromium');
			reporter.handleToken({ id: 'TEST_PASSED', title: 'stable', suite: ['S'], duration: 1, browser: 'Firefox' }, 'Firefox');

			const { flaky } = reporter.finish();
			assert.equal(flaky, 1);
		});
	});

	describe('--list output', () => {
		it('lists tests grouped by suite, deduped across browsers, and returns the counts', () => {
			const reporter = createReporter(2);

			// Same tests reported per browser (as Playwright --list does) — must be deduped.
			for (const browser of ['Chromium', 'Firefox'])
			{
				reporter.handleToken({ id: 'TEST_LISTED', title: 'первый', suite: ['Группа A'], browser }, browser);
				reporter.handleToken({ id: 'TEST_LISTED', title: 'второй', suite: ['Группа A'], browser }, browser);
				reporter.handleToken({ id: 'TEST_LISTED', title: 'корневой', suite: [], browser }, browser);
			}

			output = '';
			const result = reporter.finish();

			const plain = stripAnsi(output);
			assert.include(plain, 'Группа A');
			assert.include(plain, 'первый');
			assert.include(plain, 'корневой');
			// The list is not a pass/fail run, and the reporter doesn't print its own
			// summary — the command layer merges per-kind counts into one Summary block.
			assert.equal(result.passed, 0);
			assert.equal(result.failed, 0);
			// Deduped: 3 unique tests, not 6.
			assert.deepEqual(result.listing, { total: 3, runnable: 3, skipped: 0 });
		});

		it('marks skipped tests in the list and counts them separately', () => {
			const reporter = createReporter();

			reporter.handleToken({ id: 'TEST_LISTED', title: 'обычный', suite: ['S'] });
			reporter.handleToken({ id: 'TEST_LISTED', title: 'отложенный', suite: ['S'], pending: true });

			output = '';
			const result = reporter.finish();

			const plain = stripAnsi(output);
			// The skipped test is tagged in the list; the runnable one is not.
			assert.match(plain, /отложенный\s+skipped/);
			assert.notMatch(plain, /обычный\s+skipped/);
			// The counts come back on the result, split into runnable vs skipped.
			assert.deepEqual(result.listing, { total: 2, runnable: 1, skipped: 1 });
		});
	});
});
