import chalk from 'chalk';
import stringWidth from 'string-width';

import { stripAnsi, hasLocalFilePath } from '../../../diagnostics/code-frame';
import { groupAttachmentsByBrowser } from './test-types';
import { formatError } from '../../../diagnostics/format-error';
import { formatElapsed } from '../../../utils/format-elapsed';

import type { TestToken, ConsoleLog, NodeOutputSection, TestAttachment, ListingCounts } from './test-types';

export { stripAnsi, hasLocalFilePath };
export { truncateToWidth };

const SLOW_TEST_THRESHOLD = 75;
const PREFIX = '  ';
const isTTY = process.stdout.isTTY ?? false;
// Spinner for the active browser: the project's round multicolor "○" that cycles
// through these colors (same look as createSpinner in diag).
const SPINNER_COLORS = [
	chalk.hex('#ff6b6b'),
	chalk.hex('#ffa06b'),
	chalk.hex('#ffd06b'),
	chalk.hex('#6bffa0'),
	chalk.hex('#6bd0ff'),
	chalk.hex('#a06bff'),
	chalk.hex('#ff6bd0'),
	chalk.hex('#ff6b9a'),
];
const SPINNER_INTERVAL_MS = 100;

type FailedTest = {
	suitePath: string;
	title: string;
	duration?: number;
	browser?: string;
	error?: { message: string; stack?: string };
	attachments?: TestAttachment[];
	showDiff?: boolean;
	actual?: unknown;
	expected?: unknown;
};

type SuiteStats = {
	passed: number;
	failed: number;
	pending: number;
	duration: number;
};

type SlowTest = {
	title: string;
	duration: number;
	browser?: string;
};

type BrowserStatus = 'passed' | 'failed' | 'pending';

// Per-browser mark in a test's live browser tag: a finished result, or "running" for an
// engine that hasn't reported this test yet while the run is still going.
type BrowserTagStatus = BrowserStatus | 'running';

export type FailedTestGroup = {
	suitePath: string;
	title: string;
	browsers: string[];
	error?: { message: string; stack?: string };
	// Artifacts (screenshot / video / trace) tagged with the browser they came from, so a
	// failing test in the summary points straight at its screenshot/video/trace on disk.
	attachments?: Array<TestAttachment & { browser?: string }>;
	showDiff?: boolean;
	actual?: unknown;
	expected?: unknown;
};

type LiveLine = {
	status: BrowserStatus;
	fullPath: string;
	duration?: number;
	// Retries before this result (Playwright result.retry). > 0 = the test was flaky
	// (passed) or kept failing (failed) across retries.
	retries?: number;
	// Browsers accumulated up to (and including) the engine that produced this line,
	// fixed at creation time. Every test run in every engine is its own line, so the
	// tag grows down the list: [chromium] … [chromium · firefox] … [chromium · firefox · webkit].
	browsers: Map<string, BrowserStatus>;
};

function formatDuration(ms: number): string
{
	// Sub-second durations stay gray (ms), longer ones yellow (s / m / h).
	const color = ms < 1000 ? chalk.gray : chalk.yellow;

	return color(formatElapsed(ms));
}

function formatBrowserTag(browsers: Map<string, BrowserTagStatus>): string
{
	const parts = [...browsers.entries()].map(([name, status]) => {
		const icon = status === 'passed' ? chalk.green('✓')
			: status === 'failed' ? chalk.red('✗')
			: status === 'running' ? chalk.cyan('◌')
			: chalk.yellow('○');

		return chalk.dim(name) + ' ' + icon;
	});

	return chalk.dim('[') + parts.join(chalk.dim(' · ')) + chalk.dim(']');
}

/**
 * Retry note for a test that was retried (retries > 0). `retries` is Playwright's
 * `result.retry` on the final attempt, so attempt count = retries + 1. A passed test that
 * needed retries is flaky ("passed on attempt N"); a failed one exhausted them.
 */
function formatRetryTag(status: BrowserStatus, retries?: number): string
{
	if (!retries || retries < 1)
	{
		return '';
	}

	const attempts = retries + 1;
	const note = status === 'failed'
		? `failed after ${attempts} attempts`
		: `passed on attempt ${attempts}`;

	return ' ' + chalk.yellow(`(${note})`);
}

/**
 * Truncates a (possibly ANSI-colored) line to `maxWidth` visible columns, appending an
 * ellipsis when it's cut. The live TTY viewport rewrites in place by moving the cursor up N
 * lines — that only works if each logical line occupies exactly one terminal row, so a line
 * wider than the terminal (long test name + retry note) must be clipped, or the terminal
 * wraps it, the cursor math is off by the wrapped rows, and the block is redrawn on top of
 * itself again and again (hundreds of duplicate lines). ANSI escapes carry no width and are
 * preserved; a reset is appended so color never bleeds past the cut.
 */
function truncateToWidth(line: string, maxWidth: number): string
{
	if (maxWidth <= 0 || stringWidth(line) <= maxWidth)
	{
		return line;
	}

	const budget = maxWidth - 1; // room for the ellipsis
	const ansiPattern = /\x1B\[[0-9;]*m/y;
	let result = '';
	let width = 0;
	let index = 0;

	while (index < line.length)
	{
		ansiPattern.lastIndex = index;
		const escape = ansiPattern.exec(line);
		if (escape && escape.index === index)
		{
			// Zero-width control sequence — keep it, don't count it.
			result += escape[0];
			index += escape[0].length;
			continue;
		}

		const char = line[index];
		const charWidth = stringWidth(char);
		if (width + charWidth > budget)
		{
			break;
		}

		result += char;
		width += charWidth;
		index += 1;
	}

	return result + '…' + '\x1B[0m';
}

export class TestReporter
{
	readonly #suiteStacks = new Map<string, string[]>();
	readonly #suiteStats = new Map<string, SuiteStats>();
	readonly #failedTests: FailedTest[] = [];
	readonly #listedTests: Array<{ suitePath: string; title: string; file?: string; line?: number; pending: boolean }> = [];
	readonly #slowTests: SlowTest[] = [];
	readonly #browsers = new Set<string>();
	// Per-engine startup stage ("starting", "building", "preparing", …) shown in the status
	// bar next to the engine name until its first test result arrives. One unified bar covers
	// the whole run: stages while an engine warms up, N/M counters once its tests flow.
	readonly #browserStages = new Map<string, string>();
	// The test each engine is currently executing (e2e reports it on test begin). Shown dim
	// in the status bar so a long-running spec is visible while it runs; cleared when the
	// engine's next result arrives.
	readonly #browserCurrentTests = new Map<string, string>();
	// Status each unique test was counted with (fullPath → status). A test is
	// counted once (first browser), but a later failure in another browser upgrades
	// it from passed/pending to failed — a unique test that failed anywhere is failed.
	readonly #countedStatuses = new Map<string, BrowserStatus>();
	// Per-test outcome in each browser (fullPath → browser → status), used to build
	// the accumulating browser tag on each line with the real ✓/✗ of every engine.
	readonly #testBrowserStatuses = new Map<string, Map<string, BrowserStatus>>();
	readonly #lines: LiveLine[] = [];
	readonly #startTime: number;
	readonly #onStatus: (message: string) => void;
	readonly #showSummary: boolean;
	#liveViewportActive = false;
	#expectedBrowsers = 1;
	#viewportHeight = 0;

	#passed = 0;
	#failed = 0;
	#pending = 0;
	// Flaky tests: retried and ultimately passed, keyed by fullPath so the same one across
	// browsers counts once. A test that exhausted its retries and failed is not counted here.
	// Reported as "N flaky" in the summary.
	readonly #retried = new Set<string>();
	// Total number of tests in the run, reported up front (e.g. Playwright's
	// onBegin). 0 means "not yet known" — until then the progress falls back to
	// the count of finished tests.
	#totalTests = 0;
	// Per-browser finished count + the browser whose result arrived last. With
	// sequential engines the overall "N of total" stops moving once a test was
	// already counted in an earlier browser, so the bar looks frozen while the
	// next engine reruns the same specs. Showing "<Browser> N/total" makes the
	// active engine and its progress visible.
	readonly #browserProgress = new Map<string, number>();
	// Per-browser passed/failed tallies for the final summary's "Browsers" line.
	readonly #browserStats = new Map<string, { passed: number; failed: number }>();
	#currentBrowser = '';
	// Full ordered list of browser engines for this run (e.g. Chromium, Firefox,
	// WebKit), known up front so the status bar can show every engine's state
	// (done / running / waiting), not just the ones that already produced results.
	#allBrowsers: string[] = [];
	// Spinner animation for the active browser: a timer repaints the viewport so the
	// frame advances even while a slow test runs and no new tokens arrive.
	#spinnerFrame = 0;
	#spinnerTimer: ReturnType<typeof setInterval> | null = null;
	// fullPath of the last test touched (added or updated). The grouped live view follows it
	// so the window scrolls to the running test — its line index shifts every tick as the
	// tree is rebuilt, so we track the path, not a row index.
	#activePath = '';

	constructor(onStatus?: (message: string) => void, options: { showSummary?: boolean } = {})
	{
		this.#startTime = Date.now();
		this.#onStatus = onStatus ?? (() => {});
		this.#showSummary = options.showSummary ?? true;
		this.#onStatus('Preparing tests...');
	}

	setBrowserCount(count: number): void
	{
		this.#expectedBrowsers = count;
	}

	setBrowsers(names: string[]): void
	{
		this.#allBrowsers = names;
	}

	setTotalTests(count: number): void
	{
		this.#totalTests = count;
	}

	#startSpinner(): void
	{
		// Any engine count: the bar animates during startup stages and keeps the elapsed
		// time ticking for single-engine runs too.
		if (!isTTY || this.#spinnerTimer)
		{
			return;
		}

		this.#spinnerTimer = setInterval(() => {
			this.#spinnerFrame = (this.#spinnerFrame + 1) % SPINNER_COLORS.length;
			this.#renderViewport();
		}, SPINNER_INTERVAL_MS);
		// Don't keep the process alive just for the spinner.
		this.#spinnerTimer.unref?.();
	}

	#stopSpinner(): void
	{
		if (this.#spinnerTimer)
		{
			clearInterval(this.#spinnerTimer);
			this.#spinnerTimer = null;
		}
	}

	stop(): void
	{
		this.#stopSpinner();
		if (isTTY)
		{
			process.stdout.write('\x1B[?25h');
		}
	}

	updateStatus(status: string, browser?: string): void
	{
		// Unit strategies pass the engine explicitly with a short stage word; e2e statuses
		// arrive as free text — map the known shapes onto (engine, stage).
		if (browser)
		{
			this.#browserStages.set(browser, status);
		}
		else
		{
			const starting = /^Starting (.+)\.\.\.$/.exec(status);
			const runningAll = /^Running (\d+ )?tests?\.\.\.$/.test(status);
			const engineRunning = /^(.+?): running (.+)$/.exec(status);
			const retrying = /^(.+?): retrying (.+)$/.exec(status);

			if (starting)
			{
				this.#currentBrowser = starting[1];
				this.#browserStages.set(starting[1], 'starting');
			}
			else if (runningAll)
			{
				// Global "Running N tests..." — attribute it to the engine being started, if
				// known. Checked before the engine patterns so "6 tests" is never mistaken
				// for an engine name.
				if (this.#currentBrowser)
				{
					this.#browserStages.set(this.#currentBrowser, 'running');
				}
			}
			else if (engineRunning)
			{
				// "<Browser>: running <title>" — the engine started a test; remember which,
				// so the bar can show what a long-running spec is doing.
				this.#currentBrowser = engineRunning[1];
				this.#browserStages.set(engineRunning[1], 'running');
				this.#browserCurrentTests.set(engineRunning[1], engineRunning[2]);
			}
			else if (retrying)
			{
				this.#browserStages.set(retrying[1], 'retrying');
				this.#browserCurrentTests.set(retrying[1], retrying[2]);
			}
		}

		// One visual regime from the very start: render the same status bar the run uses,
		// live — instead of a separate text line of concatenated stage messages.
		if (isTTY)
		{
			this.#ensureLiveViewport();
			this.#startSpinner();
			this.#renderViewport();
		}
	}

	clearStatus(): void
	{
		this.#browserStages.clear();
		this.#browserCurrentTests.clear();
		this.#stopSpinner();
		this.#onStatus('');

		// If only the status bar was rendered (an error before any test results), wipe it so
		// error details don't print below a stale bar.
		if (isTTY && this.#viewportRenderedLines > 0 && this.#lines.length === 0)
		{
			process.stdout.write(`\x1B[${this.#viewportRenderedLines - 1}A\r\x1B[0J`);
			this.#viewportRenderedLines = 0;
			process.stdout.write('\x1B[?25h');
		}
	}

	handleToken(token: TestToken, browser?: string): void
	{
		// --list: no run, just collect the enumerated tests; finish() prints them.
		if (token.id === 'TEST_LISTED')
		{
			const testBrowser = token.browser ?? browser;
			if (testBrowser)
			{
				this.#browsers.add(testBrowser);
			}
			this.#listedTests.push({
				suitePath: (token.suite ?? []).join(' > '),
				title: token.title ?? '',
				file: token.file,
				line: token.line,
				pending: token.pending ?? false,
			});
			return;
		}

		const key = browser ?? '';

		if (browser)
		{
			this.#browsers.add(browser);
		}

		if (!this.#suiteStacks.has(key))
		{
			this.#suiteStacks.set(key, []);
		}

		const stack = this.#suiteStacks.get(key)!;

		if (token.id === 'SUITE_START' && !token.root)
		{
			stack.push(token.title ?? '');
		}

		if (token.id === 'SUITE_END' && !token.root)
		{
			stack.pop();
		}

		if (token.id === 'TEST_PASSED' || token.id === 'TEST_FAILED' || token.id === 'TEST_PENDING')
		{
			const suites = token.suite ?? stack;
			const suiteName = suites[0] ?? '';
			const suitePath = suites.join(' > ');
			const fullPath = suitePath ? `${suitePath} > ${token.title}` : (token.title ?? '');
			const status: BrowserStatus = token.id === 'TEST_PASSED' ? 'passed'
				: token.id === 'TEST_FAILED' ? 'failed'
				: 'pending';

			if (browser)
			{
				this.#currentBrowser = browser;
				this.#browserProgress.set(browser, (this.#browserProgress.get(browser) ?? 0) + 1);
				// This engine's in-flight test just finished — drop its "currently running"
				// note; the next test begin will set a fresh one.
				this.#browserCurrentTests.delete(browser);

				if (!this.#browserStats.has(browser))
				{
					this.#browserStats.set(browser, { passed: 0, failed: 0 });
				}
				const bs = this.#browserStats.get(browser)!;
				if (status === 'passed')
				{
					bs.passed++;
				}
				else if (status === 'failed')
				{
					bs.failed++;
				}
			}

			if (!this.#suiteStats.has(suiteName))
			{
				this.#suiteStats.set(suiteName, { passed: 0, failed: 0, pending: 0, duration: 0 });
			}

			const stats = this.#suiteStats.get(suiteName)!;

			// Every run of a test (in each browser) is its own line in the list — the
			// list grows down with the browser tag accumulating. But the run-wide
			// counters and per-suite stats count each unique test once (the first time
			// its fullPath is seen), so the summary reads "9 passed", not "27 passed".
			// A later failure in another browser upgrades the counted status to failed.
			const countedStatus = this.#countedStatuses.get(fullPath);

			if (countedStatus === undefined)
			{
				this.#countedStatuses.set(fullPath, status);
				stats.duration += token.duration ?? 0;

				if (status === 'passed')
				{
					this.#passed++;
					stats.passed++;
				}
				else if (status === 'failed')
				{
					this.#failed++;
					stats.failed++;
				}
				else
				{
					this.#pending++;
					stats.pending++;
				}

				if (status === 'failed' && typeof token.duration === 'number' && token.duration > SLOW_TEST_THRESHOLD)
				{
					this.#slowTests.push({ title: fullPath, duration: token.duration, browser });
				}
			}
			else if (status === 'failed' && countedStatus !== 'failed')
			{
				this.#countedStatuses.set(fullPath, 'failed');

				if (countedStatus === 'passed')
				{
					this.#passed--;
					stats.passed--;
				}
				else
				{
					this.#pending--;
					stats.pending--;
				}

				this.#failed++;
				stats.failed++;
			}

			if (browser)
			{
				if (!this.#testBrowserStatuses.has(fullPath))
				{
					this.#testBrowserStatuses.set(fullPath, new Map());
				}
				this.#testBrowserStatuses.get(fullPath)!.set(browser, status);
			}

			// Flaky = retried AND ultimately passed. A test that kept failing through its
			// retries is just a failure, not flaky, so it doesn't count here.
			if (token.retries && token.retries > 0 && status === 'passed')
			{
				this.#retried.add(fullPath);
			}

			this.#appendLine(status, fullPath, token.duration, browser, token.retries);

			if (token.id === 'TEST_FAILED')
			{
				this.#failedTests.push({
					suitePath,
					title: token.title ?? '',
					duration: token.duration,
					browser,
					error: token.error,
					attachments: token.attachments,
					showDiff: token.showDiff,
					actual: token.actual,
					expected: token.expected,
				});
			}
		}
	}

	// One-time switch into live rendering: silence the task runner's own spinner line (it
	// clears itself), size the viewport, hide the cursor. Entered either by the first status
	// update (startup bar) or by the first test result — whichever comes first.
	#ensureLiveViewport(): void
	{
		if (this.#liveViewportActive)
		{
			return;
		}
		this.#liveViewportActive = true;
		this.#onStatus('');

		// Leave room for task runner lines above and status bar below.
		// Use a generous margin so the viewport never exceeds terminal height.
		this.#viewportHeight = Math.max(3, (process.stdout.rows ?? 24) - 6);

		// Hide cursor during live rendering (TTY only — in a pipe it leaks "[?25l").
		if (isTTY)
		{
			process.stdout.write('\x1B[?25l');
		}
	}

	#appendLine(status: BrowserStatus, fullPath: string, duration?: number, browser?: string, retries?: number): void
	{
		this.#ensureLiveViewport();

		// Tag = every engine that has reported this test so far, each with its real outcome,
		// ordered by the run's browser order. This works for both sequential e2e (each new
		// browser's line shows all engines up to it) and parallel unit (browsers report out
		// of order, so we can't assume "up to the current one" — we take everyone recorded).
		// The final grouped view keeps the line with the most engines, so the last line to
		// arrive carries the full tag, e.g. [Chromium ✓ · Firefox ✓ · WebKit ✓].
		const browsers = new Map<string, BrowserStatus>();
		if (browser)
		{
			const recorded = this.#testBrowserStatuses.get(fullPath);
			const order = this.#allBrowsers.length > 0 ? this.#allBrowsers : [browser];
			for (const name of order)
			{
				const recordedStatus = recorded?.get(name);
				if (recordedStatus)
				{
					browsers.set(name, recordedStatus);
				}
			}
			// Guarantee the current engine is present even if not yet recorded.
			browsers.set(browser, status);
		}

		const live: LiveLine = {
			status,
			fullPath,
			duration,
			retries,
			browsers,
		};
		this.#lines.push(live);
		this.#activePath = fullPath;

		if (!isTTY)
		{
			process.stdout.write(this.#formatLine(live) + '\n');
			return;
		}

		this.#renderViewport();
	}

	#viewportRenderedLines = 0;

	#renderViewport(): void
	{
		this.#startSpinner();

		// Render the same suite-grouped tree as the final reprint, live. It's rebuilt every
		// tick (test line indices shift as suites fill in), so we follow the active test by
		// its line index in the freshly built tree rather than a fixed row.
		const { lines: treeLines, activeIndex } = this.#buildGroupedLines(true);

		const total = treeLines.length;
		const visibleCount = Math.min(total, this.#viewportHeight);

		// Keep the just-touched test in view (near the bottom, completed tests above for
		// context). Falls back to the tail before the first test arrives.
		const anchor = activeIndex >= 0 ? activeIndex : total - 1;
		let startIndex = anchor - visibleCount + 1;
		startIndex = Math.max(0, Math.min(startIndex, total - visibleCount));

		// Clip to the terminal width so each logical line is exactly one terminal row —
		// otherwise wrapped lines break the cursor-up math and the block redraws on itself.
		const width = process.stdout.columns ?? 80;

		const visibleLines: string[] = [];
		for (let i = startIndex; i < startIndex + visibleCount; i++)
		{
			visibleLines.push(truncateToWidth(treeLines[i], width));
		}

		visibleLines.push('');
		visibleLines.push(truncateToWidth(this.#formatStatusBar(), width));

		// Move cursor to the beginning of the previously rendered block
		if (this.#viewportRenderedLines > 0)
		{
			process.stdout.write(`\x1B[${this.#viewportRenderedLines - 1}A\r`);
		}

		// Write lines, using \r\n to ensure we stay aligned
		let output = '';
		for (let i = 0; i < visibleLines.length; i++)
		{
			if (i > 0)
			{
				output += '\n';
			}

			output += '\x1B[2K' + visibleLines[i];
		}

		process.stdout.write(output);
		this.#viewportRenderedLines = visibleLines.length;
	}

	#formatStatusBar(): string
	{
		const elapsed = formatDuration(Date.now() - this.#startTime);
		const spinner = isTTY
			? SPINNER_COLORS[this.#spinnerFrame % SPINNER_COLORS.length]('○')
			: chalk.cyan('○');

		// Engines known up front (setBrowsers); before that (e2e before its config is read),
		// whatever engines have already reported a startup stage.
		const names = this.#allBrowsers.length > 0 ? this.#allBrowsers : [...this.#browserStages.keys()];
		const started = this.#passed + this.#failed + this.#pending > 0;

		// Nothing known yet at all — a bare pulse until the first stage arrives.
		if (names.length === 0)
		{
			return `${PREFIX} ${spinner} ${chalk.dim('starting')} ${chalk.gray('·')} ${elapsed}`;
		}

		// Engine bar: every engine's state at once — done (✓ N/M), tests flowing (N/M
		// counter), warming up (its startup stage), or queued (○). Used for multi-engine
		// runs, and during startup for any run — one visual regime from launch to finish.
		if (names.length > 1 || !started)
		{
			const total = this.#totalTests;
			const of = total > 0 ? `/${total}` : '';
			const segments = names.map((name) => {
				const done = this.#browserProgress.get(name) ?? 0;
				const isDone = total > 0 && done >= total;
				const stage = this.#browserStages.get(name);
				// What the engine is executing right now (e2e). A long spec would otherwise
				// leave the bar frozen for its whole duration with nothing to show.
				const currentTest = this.#browserCurrentTests.get(name);
				const testNote = currentTest ? ` ${chalk.dim(truncateToWidth(currentTest, 48))}` : '';

				if (isDone)
				{
					// Keep the count on finished engines too (e.g. "✓ Chromium 9/9").
					return `${chalk.green('✓')} ${chalk.dim(name)} ${chalk.dim(`${done}${of}`)}`;
				}
				if (done > 0 || (stage === 'running' && total > 0))
				{
					// Tests are flowing (or about to): progress counter from 0/N up, plus the
					// spec currently in flight.
					return `${spinner} ${chalk.cyan(name)} ${done}${of}${testNote}`;
				}
				if (stage)
				{
					return `${spinner} ${chalk.cyan(name)} ${chalk.dim(stage)}${testNote}`;
				}
				// Queued engine in a sequential run — not started yet.
				return `${chalk.gray('○')} ${chalk.gray(name)}`;
			});

			return `${PREFIX} ${segments.join(chalk.gray('  ·  '))} ${chalk.gray('·')} ${elapsed}`;
		}

		// Single browser: simple "✓ N of total" counter.
		const finished = this.#passed + this.#failed + this.#pending;
		const total = this.#totalTests > 0 ? this.#totalTests : finished;
		const parts: string[] = [];

		if (this.#passed > 0)
		{
			parts.push(chalk.green(`✓ ${this.#passed}`));
		}
		if (this.#failed > 0)
		{
			parts.push(chalk.red(`✗ ${this.#failed}`));
		}
		if (this.#pending > 0)
		{
			parts.push(chalk.yellow(`○ ${this.#pending}`));
		}

		return `${PREFIX} ${parts.join(chalk.gray('  '))} ${chalk.gray(`of ${total}`)} ${chalk.gray('·')} ${elapsed}`;
	}

	#formatLine(live: LiveLine): string
	{
		const { status, fullPath, duration, browsers, retries } = live;

		// Each line is one finished run in one engine, so it shows its final status
		// immediately — no pending "◌ waiting for the other browsers" state.
		const durationStr = typeof duration === 'number'
			? ' ' + formatDuration(duration)
			: '';
		const browserTag = browsers.size > 0
			? ' ' + formatBrowserTag(browsers)
			: '';
		const retryTag = formatRetryTag(status, retries);

		if (status === 'passed')
		{
			return `${PREFIX} ${chalk.green('✓')} ${chalk.dim(fullPath)}${durationStr}${retryTag}${browserTag}`;
		}

		if (status === 'failed')
		{
			return `${PREFIX} ${chalk.red('✗')} ${fullPath}${durationStr}${retryTag}${browserTag}`;
		}

		if (status === 'pending')
		{
			return `${PREFIX} ${chalk.yellow('○')} ${chalk.dim(fullPath)} ${chalk.yellow('skipped')}`;
		}

		return '';
	}

	// Grouped-by-suite view (like --list): the suite path is a heading printed once, its
	// tests indented beneath it. A test run in several browsers is one line, tagged with its
	// engines' outcomes. `live` adds a "running" (◌) mark for engines yet to report a test —
	// used by the live viewport; the final reprint (finish, default) shows outcomes only.
	// Returns the text (exposed for testing); finish() writes it to stdout in TTY mode.
	formatGroupedResults(live = false): string
	{
		return this.#buildGroupedLines(live).lines.join('\n');
	}

	// Builds the grouped-by-suite view as an array of lines (headings + indented test lines,
	// blank line between suites). Also reports which line is the active test (last one
	// touched), so the live viewport can keep it in view. Shared by the live render and the
	// final reprint so both look identical — except `live` adds a "running" (◌) mark for
	// engines that haven't reported a test yet, which the final report omits.
	#buildGroupedLines(isLive: boolean): { lines: string[]; activeIndex: number }
	{
		// Collapse per-browser lines for the same test into one, keeping the entry with the
		// most complete browser tag (the last engine's line carries every engine's outcome).
		const byPath = new Map<string, LiveLine>();
		for (const live of this.#lines)
		{
			const existing = byPath.get(live.fullPath);
			if (!existing || live.browsers.size >= existing.browsers.size)
			{
				byPath.set(live.fullPath, live);
			}
		}

		// Group the collapsed tests by their suite path (everything but the last segment),
		// preserving first-seen order so the output follows the run order.
		const bySuite = new Map<string, LiveLine[]>();
		for (const live of byPath.values())
		{
			const segments = live.fullPath.split(' > ');
			const suitePath = segments.slice(0, -1).join(' > ');
			const list = bySuite.get(suitePath) ?? [];
			list.push(live);
			bySuite.set(suitePath, list);
		}

		const lines: string[] = [];
		let activeIndex = -1;
		let first = true;
		for (const [suitePath, tests] of bySuite)
		{
			if (!first)
			{
				lines.push('');
			}
			first = false;

			if (suitePath)
			{
				lines.push(`${PREFIX} ${chalk.bold(suitePath)}`);
			}
			for (const live of tests)
			{
				if (live.fullPath === this.#activePath)
				{
					activeIndex = lines.length;
				}
				lines.push(this.#formatGroupedLine(live, isLive));
			}
		}

		return { lines, activeIndex };
	}

	// A test's browser tag. In live mode every engine that hasn't reported this test yet is
	// shown as "running" (◌) alongside the finished ✓/✗ ones, so you can see which browsers
	// are still working on it. The final report passes isLive=false and shows only outcomes.
	#browserTag(live: LiveLine, isLive: boolean): Map<string, BrowserTagStatus>
	{
		const tag = new Map<string, BrowserTagStatus>(live.browsers);

		if (isLive)
		{
			for (const name of this.#allBrowsers)
			{
				if (!tag.has(name))
				{
					tag.set(name, 'running');
				}
			}
		}

		return tag;
	}

	// One test line under a suite heading: the same icon/duration/browser tag as the flat
	// view, but only the test's own title (the suite path is the heading above), indented.
	#formatGroupedLine(live: LiveLine, isLive: boolean): string
	{
		const { status, fullPath, duration, retries } = live;
		const title = fullPath.split(' > ').at(-1) ?? fullPath;

		const browsers = this.#browserTag(live, isLive);
		const durationStr = typeof duration === 'number' ? ' ' + formatDuration(duration) : '';
		const browserTag = browsers.size > 0 ? ' ' + formatBrowserTag(browsers) : '';
		const retryTag = formatRetryTag(status, retries);

		if (status === 'passed')
		{
			return `${PREFIX}   ${chalk.green('✓')} ${chalk.dim(title)}${durationStr}${retryTag}${browserTag}`;
		}

		if (status === 'failed')
		{
			return `${PREFIX}   ${chalk.red('✗')} ${title}${durationStr}${retryTag}${browserTag}`;
		}

		if (status === 'pending')
		{
			return `${PREFIX}   ${chalk.yellow('○')} ${chalk.dim(title)} ${chalk.yellow('skipped')}`;
		}

		return '';
	}

	#groupFailedTests(): FailedTestGroup[]
	{
		const groups = new Map<string, FailedTestGroup>();

		for (const test of this.#failedTests)
		{
			const path = test.suitePath ? `${test.suitePath} > ${test.title}` : test.title;

			const taggedAttachments = (test.attachments ?? []).map(
				(attachment) => ({ ...attachment, browser: test.browser }),
			);

			if (groups.has(path))
			{
				const group = groups.get(path)!;
				if (test.browser)
				{
					group.browsers.push(test.browser);
				}

				if (test.error?.stack && hasLocalFilePath(test.error.stack) && !hasLocalFilePath(group.error?.stack))
				{
					group.error = test.error;
				}

				if (taggedAttachments.length > 0)
				{
					(group.attachments ??= []).push(...taggedAttachments);
				}
			}
			else
			{
				groups.set(path, {
					suitePath: test.suitePath,
					title: test.title,
					browsers: test.browser ? [test.browser] : [],
					error: test.error,
					...(taggedAttachments.length > 0 ? { attachments: taggedAttachments } : {}),
					showDiff: test.showDiff,
					actual: test.actual,
					expected: test.expected,
				});
			}
		}

		return [...groups.values()];
	}

	#printListing(): ListingCounts
	{
		// Dedupe across browsers — a test repeated per project is one test in the listing.
		const seen = new Set<string>();
		const bySuite = new Map<string, Array<{ title: string; pending: boolean }>>();
		let skipped = 0;
		for (const test of this.#listedTests)
		{
			const key = `${test.suitePath} ${test.title}`;
			if (seen.has(key))
			{
				continue;
			}
			seen.add(key);
			if (test.pending)
			{
				skipped++;
			}
			const list = bySuite.get(test.suitePath) ?? [];
			list.push({ title: test.title, pending: test.pending });
			bySuite.set(test.suitePath, list);
		}

		const lines: string[] = [''];
		let first = true;
		for (const [suitePath, tests] of bySuite)
		{
			if (!first)
			{
				lines.push('');
			}
			first = false;

			if (suitePath)
			{
				lines.push(`${PREFIX} ${chalk.bold(suitePath)}`);
			}
			for (const test of tests)
			{
				// Reuse the run-report look: skipped tests get the yellow ○ + "skipped"
				// marker; a test that would run gets a neutral grey ○.
				lines.push(test.pending
					? `${PREFIX}   ${chalk.yellow('○')} ${chalk.dim(test.title)} ${chalk.yellow('skipped')}`
					: `${PREFIX}   ${chalk.gray('○')} ${chalk.dim(test.title)}`);
			}
		}

		lines.push('');

		console.log(lines.join('\n'));

		// The Summary block isn't printed here — it's per test kind, but the command layer
		// wants one combined block (Unit / E2E lines together), so it collects these counts
		// from finish() and prints the summary once after all kinds have listed.
		const total = seen.size;

		return { total, runnable: total - skipped, skipped };
	}

	finish(options: { consoleLogs?: ConsoleLog[]; nodeOutput?: NodeOutputSection[] } = {}): { passed: number; failed: number; failures: FailedTestGroup[]; browsers: Array<{ name: string; passed: number; failed: number }>; listing?: ListingCounts; flaky?: number }
	{
		const consoleLogs = options.consoleLogs ?? [];
		const nodeOutput = options.nodeOutput ?? [];

		this.#stopSpinner();
		this.#onStatus('');

		// --list: print the enumerated tests grouped by suite (unique tests, not per-browser).
		// The counts go back to the caller, which prints one combined Summary across kinds.
		if (this.#listedTests.length > 0)
		{
			const listing = this.#printListing();
			return { passed: 0, failed: 0, failures: [], browsers: [], listing };
		}

		const wallTime = Date.now() - this.#startTime;
		const total = this.#passed + this.#failed + this.#pending;
		const failures = this.#groupFailedTests();

		// Clear status line — covers the case where no TEST_* tokens arrived
		// (empty describe blocks, suites without any tests).
		this.#onStatus('');

		// In TTY the live viewport showed only a scrolling window of the grouped tree, so
		// clear it and reprint the full tree. In non-TTY every line was already streamed as
		// it arrived (#appendLine), so reprinting here would duplicate the whole list.
		if (isTTY)
		{
			if (this.#viewportRenderedLines > 0)
			{
				// Move to start of viewport block and clear everything below
				process.stdout.write(`\x1B[${this.#viewportRenderedLines - 1}A\r\x1B[0J`);
				this.#viewportRenderedLines = 0;

				// Show cursor again
				process.stdout.write('\x1B[?25h');
			}

			process.stdout.write(this.formatGroupedResults() + '\n');
		}

		const lines: string[] = [];

		// Failed test details (grouped by path) — only in single-extension mode.
		// In bulk mode the failures are aggregated and printed once in printSummary.
		if (this.#showSummary && failures.length > 0)
		{
			lines.push('');
			lines.push(`${PREFIX} ${chalk.red.bold(`Failed Tests (${failures.length}):`)}`);

			for (let idx = 0; idx < failures.length; idx++)
			{
				const group = failures[idx];
				const browsers = group.browsers.length > 0
					? chalk.dim(` [${group.browsers.join(' · ')}]`)
					: '';
				const path = group.suitePath ? `${group.suitePath} > ${group.title}` : group.title;
				const counter = chalk.dim(`${idx + 1}/${failures.length}`);

				lines.push('');
				if (idx > 0)
				{
					lines.push(`${PREFIX} ${chalk.dim('─'.repeat(40))}`);
					lines.push('');
				}
				lines.push(`${PREFIX} ${counter} ${chalk.red(path)}${browsers}`);

				const errorLines = formatError({
					message: group.error?.message ? stripAnsi(group.error.message) : '',
					stack: group.error?.stack,
					showDiff: group.showDiff,
					actual: group.actual,
					expected: group.expected,
				}, `${PREFIX} `);

				if (errorLines.length > 0)
				{
					lines.push('');
					lines.push(...errorLines);
				}

				const attachments = group.attachments ?? [];
				if (attachments.length > 0)
				{
					// Separate block from the error, grouped per browser. Each path is on its
					// own `at <path>` line so terminals/IDEs linkify it (stack-frame convention);
					// a mid-line or dim-styled path is not linkified.
					lines.push('');
					for (const [browser, items] of groupAttachmentsByBrowser(attachments))
					{
						if (browser)
						{
							lines.push(`${PREFIX}   ${chalk.cyan.bold(browser)}`);
						}
						for (const attachment of items)
						{
							lines.push(`${PREFIX}     ${chalk.cyan(attachment.name)}`);
							lines.push(`${PREFIX}       at ${attachment.path}`);
						}
					}
				}
			}
		}

		if (this.#showSummary)
		{
			// Summary
			lines.push('');

			const summaryParts = [
				this.#passed > 0 ? chalk.green.bold(`${this.#passed} passed`) : null,
				this.#failed > 0 ? chalk.red.bold(`${this.#failed} failed`) : null,
				this.#pending > 0 ? chalk.yellow(`${this.#pending} pending`) : null,
			].filter(Boolean);

			lines.push(`${PREFIX} ${chalk.bold('Tests')}     ${summaryParts.join(chalk.gray(' | '))} ${chalk.gray(`(${total})`)}`);

			if (this.#browsers.size > 0)
			{
				const browserList = [...this.#browsers].join(chalk.gray(' · '));
				lines.push(`${PREFIX} ${chalk.bold('Browsers')}  ${browserList}`);
			}

			lines.push(`${PREFIX} ${chalk.bold('Time')}      ${formatDuration(wallTime)}`);

			// Slow tests
			const slowTests = this.#slowTests
				.sort((a, b) => b.duration - a.duration)
				.slice(0, 3);

			if (slowTests.length > 0)
			{
				lines.push('');
				lines.push(`${PREFIX} ${chalk.yellow.bold('Slow tests:')}`);
				for (const test of slowTests)
				{
					const browserTag = test.browser ? chalk.dim(` [${test.browser}]`) : '';
					lines.push(`${PREFIX}   ${chalk.yellow(`${test.duration}ms`)} ${chalk.gray('→')} ${test.title}${browserTag}`);
				}
			}
		}

		// Console output (deduplicated with counts)
		if (consoleLogs.length > 0)
		{
			const grouped: Array<{ type: string; text: string; count: number }> = [];
			const seen = new Map<string, number>();

			for (const log of consoleLogs)
			{
				const key = `${log.type}:${log.text}`;
				const index = seen.get(key);
				if (index !== undefined)
				{
					grouped[index].count++;
				}
				else
				{
					seen.set(key, grouped.length);
					grouped.push({ type: log.type, text: log.text, count: 1 });
				}
			}

			lines.push('');
			lines.push(`${PREFIX} ${chalk.bold('Console output:')}`);
			for (const { type, text, count } of grouped)
			{
				const prefix = type === 'error' ? chalk.red('error')
					: type === 'warning' ? chalk.yellow('warn')
					: chalk.gray('log');
				const countSuffix = count > 1 ? chalk.yellow(` ×${count}`) : '';
				lines.push(`${PREFIX} ${chalk.gray('[')}${prefix}${chalk.gray(']')} ${text}${countSuffix}`);
			}
		}

		// Node-side stdout of the test process, printed verbatim (not deduplicated like the
		// browser console above) so multi-line output keeps its shape. Grouped per browser,
		// and within a browser each console.* call is marked with `›` so messages are
		// visually delimited — a multi-line message's continuation is indented under it.
		const nodeSections = nodeOutput.filter((section) => section.messages.length > 0);
		if (nodeSections.length > 0)
		{
			lines.push('');
			lines.push(`${PREFIX} ${chalk.bold('Node output:')}`);
			nodeSections.forEach((section, index) => {
				if (section.browser)
				{
					// Blank separator line between engines (not before the first one).
					if (index > 0)
					{
						lines.push(`${PREFIX} ${chalk.gray('│')}`);
					}
					lines.push(`${PREFIX} ${chalk.gray('│')} ${chalk.cyan.bold(section.browser)}`);
				}

				for (const message of section.messages)
				{
					const [first, ...rest] = message.split('\n');
					lines.push(`${PREFIX} ${chalk.gray('│')}   ${chalk.gray('›')} ${first}`);
					for (const line of rest)
					{
						lines.push(`${PREFIX} ${chalk.gray('│')}     ${line}`);
					}
				}
			});
		}

		lines.push('');
		console.log(lines.join('\n'));

		// Per-browser breakdown, in run order (falls back to insertion order).
		const orderedBrowsers = this.#allBrowsers.length > 0
			? this.#allBrowsers
			: [...this.#browserStats.keys()];
		const browsers = orderedBrowsers
			.filter((name) => this.#browserStats.has(name))
			.map((name) => ({ name, ...this.#browserStats.get(name)! }));

		return { passed: this.#passed, failed: this.#failed, failures, browsers, flaky: this.#retried.size };
	}
}
