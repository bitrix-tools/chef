import chalk from 'chalk';

import { stripAnsi, hasLocalFilePath } from '../../../diagnostics/code-frame';
import { formatError } from '../../../diagnostics/format-error';
import { formatElapsed } from '../../../utils/format-elapsed';

import type { TestToken, ConsoleLog, NodeOutputSection } from './test-types';

export { stripAnsi, hasLocalFilePath };

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

export type FailedTestGroup = {
	suitePath: string;
	title: string;
	browsers: string[];
	error?: { message: string; stack?: string };
	showDiff?: boolean;
	actual?: unknown;
	expected?: unknown;
};

type LiveLine = {
	status: BrowserStatus;
	fullPath: string;
	duration?: number;
	// Browsers accumulated up to (and including) the engine that produced this line,
	// fixed at creation time. Every test run in every engine is its own line, so the
	// tag grows down the list: [chromium] … [chromium · firefox] … [chromium · firefox · webkit].
	browsers: Map<string, BrowserStatus>;
	row: number;
};

function formatDuration(ms: number): string
{
	// Sub-second durations stay gray (ms), longer ones yellow (s / m / h).
	const color = ms < 1000 ? chalk.gray : chalk.yellow;

	return color(formatElapsed(ms));
}

function formatBrowserTag(browsers: Map<string, BrowserStatus>): string
{
	const parts = [...browsers.entries()].map(([name, status]) => {
		const icon = status === 'passed' ? chalk.green('✓')
			: status === 'failed' ? chalk.red('✗')
			: chalk.yellow('○');

		return chalk.dim(name) + ' ' + icon;
	});

	return chalk.dim('[') + parts.join(chalk.dim(' · ')) + chalk.dim(']');
}

export class TestReporter
{
	readonly #suiteStacks = new Map<string, string[]>();
	readonly #suiteStats = new Map<string, SuiteStats>();
	readonly #failedTests: FailedTest[] = [];
	readonly #slowTests: SlowTest[] = [];
	readonly #browsers = new Set<string>();
	readonly #browserStatuses = new Map<string, string>();
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
	#hasResults = false;
	#expectedBrowsers = 1;
	#viewportHeight = 0;

	#passed = 0;
	#failed = 0;
	#pending = 0;
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
	// Index of the line touched last (added or updated). The viewport follows it so
	// that in the 2nd/3rd browser — which updates already-listed lines rather than
	// appending — the visible window scrolls to the running test instead of being
	// stuck on the tail.
	#activeRow = -1;

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
		if (!isTTY || this.#spinnerTimer || this.#allBrowsers.length <= 1)
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
		// "Starting <Browser>..." marks the moment a new engine is launching. Between
		// engines there are no test tokens yet, so without this the status bar would
		// freeze on the previous (finished) browser with no spinner. Mark the new
		// engine active so the spinner moves to it immediately, and keep the spinner
		// timer running even after results have started.
		if (this.#allBrowsers.length > 1)
		{
			const starting = this.#allBrowsers.find((name) => status === `Starting ${name}...`);
			if (starting)
			{
				this.#currentBrowser = starting;
				this.#startSpinner();
				if (this.#hasResults)
				{
					this.#renderViewport();
				}
				return;
			}
		}

		if (this.#hasResults)
		{
			return;
		}

		if (browser)
		{
			this.#browserStatuses.set(browser, status);

			const parts = [...this.#browserStatuses.entries()]
				.map(([name, s]) => `${name}: ${s}`)
				.join(' · ');

			this.#onStatus(parts);
		}
		else
		{
			this.#onStatus(status);
		}
	}

	clearStatus(): void
	{
		this.#browserStatuses.clear();
		this.#onStatus('');
	}

	handleToken(token: TestToken, browser?: string): void
	{
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

			this.#appendLine(status, fullPath, token.duration, browser);

			if (token.id === 'TEST_FAILED')
			{
				this.#failedTests.push({
					suitePath,
					title: token.title ?? '',
					duration: token.duration,
					browser,
					error: token.error,
					showDiff: token.showDiff,
					actual: token.actual,
					expected: token.expected,
				});
			}
		}
	}

	#appendLine(status: BrowserStatus, fullPath: string, duration?: number, browser?: string): void
	{
		if (!this.#hasResults)
		{
			this.#hasResults = true;
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

		// Tag = every engine up to and including this one, fixed now, each with its
		// real outcome. With sequential engines #allBrowsers is the run order; we walk
		// it up to the current browser and read each engine's actual ✓/✗ for this test,
		// so Chromium lines show [chromium ✓], Firefox lines [chromium ✓ · firefox ✗], etc.
		const browsers = new Map<string, BrowserStatus>();
		if (browser)
		{
			const order = this.#allBrowsers.length > 0 ? this.#allBrowsers : [browser];
			const recorded = this.#testBrowserStatuses.get(fullPath);
			const upTo = order.indexOf(browser);
			const through = upTo >= 0 ? order.slice(0, upTo + 1) : [browser];
			for (const name of through)
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
			browsers,
			row: this.#lines.length,
		};
		this.#lines.push(live);
		this.#activeRow = live.row;

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

		const total = this.#lines.length;
		const visibleCount = Math.min(total, this.#viewportHeight);

		// Follow the active line: keep the window so the just-touched test is visible
		// (placed near the bottom, with completed tests above for context). When lines
		// are only appended (first browser) this collapses to the usual tail view.
		const anchor = this.#activeRow >= 0 ? this.#activeRow : total - 1;
		// Put the anchor on the last row of the window, then clamp to list bounds.
		let startIndex = anchor - visibleCount + 1;
		startIndex = Math.max(0, Math.min(startIndex, total - visibleCount));

		const visibleLines: string[] = [];
		for (let i = startIndex; i < startIndex + visibleCount; i++)
		{
			visibleLines.push(this.#formatLine(this.#lines[i]));
		}

		visibleLines.push('');
		visibleLines.push(this.#formatStatusBar());

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

		// Multi-browser run (engines run sequentially): show every engine's state at
		// once — done (✓), running (◌ N/total), or waiting (○). This is clearer than a
		// single overall counter, which freezes once an engine reruns already-counted
		// specs.
		if (this.#allBrowsers.length > 1)
		{
			const total = this.#totalTests;
			const of = total > 0 ? `/${total}` : '';
			const segments = this.#allBrowsers.map((name) => {
				const done = this.#browserProgress.get(name) ?? 0;
				const isDone = total > 0 && done >= total;
				const isActive = name === this.#currentBrowser && !isDone;

				if (isDone)
				{
					// Keep the count on finished engines too (e.g. "✓ Chromium 9/9").
					return `${chalk.green('✓')} ${chalk.dim(name)} ${chalk.dim(`${done}${of}`)}`;
				}
				if (isActive)
				{
					const spinner = isTTY
						? SPINNER_COLORS[this.#spinnerFrame % SPINNER_COLORS.length]('○')
						: chalk.cyan('○');
					return `${spinner} ${chalk.cyan(name)} ${done}${of}`;
				}
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
		const { status, fullPath, duration, browsers } = live;

		// Each line is one finished run in one engine, so it shows its final status
		// immediately — no pending "◌ waiting for the other browsers" state.
		const durationStr = typeof duration === 'number'
			? ' ' + formatDuration(duration)
			: '';
		const browserTag = browsers.size > 0
			? ' ' + formatBrowserTag(browsers)
			: '';

		if (status === 'passed')
		{
			return `${PREFIX} ${chalk.green('✓')} ${chalk.dim(fullPath)}${durationStr}${browserTag}`;
		}

		if (status === 'failed')
		{
			return `${PREFIX} ${chalk.red('✗')} ${fullPath}${durationStr}${browserTag}`;
		}

		if (status === 'pending')
		{
			return `${PREFIX} ${chalk.yellow('○')} ${chalk.dim(fullPath)} ${chalk.yellow('skipped')}`;
		}

		return '';
	}

	#groupFailedTests(): FailedTestGroup[]
	{
		const groups = new Map<string, FailedTestGroup>();

		for (const test of this.#failedTests)
		{
			const path = test.suitePath ? `${test.suitePath} > ${test.title}` : test.title;

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
			}
			else
			{
				groups.set(path, {
					suitePath: test.suitePath,
					title: test.title,
					browsers: test.browser ? [test.browser] : [],
					error: test.error,
					showDiff: test.showDiff,
					actual: test.actual,
					expected: test.expected,
				});
			}
		}

		return [...groups.values()];
	}

	finish(options: { consoleLogs?: ConsoleLog[]; nodeOutput?: NodeOutputSection[] } = {}): { passed: number; failed: number; failures: FailedTestGroup[]; browsers: Array<{ name: string; passed: number; failed: number }> }
	{
		const consoleLogs = options.consoleLogs ?? [];
		const nodeOutput = options.nodeOutput ?? [];

		this.#stopSpinner();

		const wallTime = Date.now() - this.#startTime;
		const total = this.#passed + this.#failed + this.#pending;
		const failures = this.#groupFailedTests();

		// Clear status line — covers the case where no TEST_* tokens arrived
		// (empty describe blocks, suites without any tests).
		this.#onStatus('');

		// In TTY the live viewport showed only a scrolling window, so clear it and
		// reprint the full list. In non-TTY every line was already streamed as it
		// arrived (#appendLine), so reprinting here would duplicate the whole list.
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

			for (const live of this.#lines)
			{
				process.stdout.write(this.#formatLine(live) + '\n');
			}
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

		return { passed: this.#passed, failed: this.#failed, failures, browsers };
	}
}
