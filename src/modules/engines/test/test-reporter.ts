import chalk from 'chalk';

import { stripAnsi, hasLocalFilePath } from '../../../diagnostics/code-frame';
import { formatError } from '../../../diagnostics/format-error';

import type { TestToken, ConsoleLog } from './test-types';

export { stripAnsi, hasLocalFilePath };

const SLOW_TEST_THRESHOLD = 75;
const PREFIX = '  ';
const isTTY = process.stdout.isTTY ?? false;

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
	browsers: Map<string, BrowserStatus>;
	row: number;
};

function formatDuration(ms: number): string
{
	if (ms < 1)
	{
		return chalk.gray('< 1ms');
	}

	if (ms < 1000)
	{
		return chalk.gray(`${Math.round(ms)}ms`);
	}

	return chalk.yellow(`${(ms / 1000).toFixed(2)}s`);
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
	readonly #countedTests = new Set<string>();
	readonly #liveLines = new Map<string, LiveLine>();
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

	stop(): void
	{
		if (isTTY)
		{
			process.stdout.write('\x1B[?25h');
		}
	}

	updateStatus(status: string, browser?: string): void
	{
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

			if (!this.#suiteStats.has(suiteName))
			{
				this.#suiteStats.set(suiteName, { passed: 0, failed: 0, pending: 0, duration: 0 });
			}

			const stats = this.#suiteStats.get(suiteName)!;
			const existing = this.#liveLines.get(fullPath);

			if (!existing)
			{
				// First occurrence of this test — count it
				this.#countedTests.add(fullPath);
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

				this.#appendLine(fullPath, status, fullPath, token.duration, browser);

				if (status === 'failed' && typeof token.duration === 'number' && token.duration > SLOW_TEST_THRESHOLD)
				{
					this.#slowTests.push({ title: fullPath, duration: token.duration, browser });
				}
			}
			else
			{
				// Same test in another browser — update the line
				if (browser)
				{
					existing.browsers.set(browser, status);
				}

				// If this browser failed but the test was previously counted as passed, upgrade to failed
				if (status === 'failed' && existing.status !== 'failed')
				{
					const previousStatus = existing.status;
					existing.status = 'failed';

					if (previousStatus === 'passed')
					{
						this.#passed--;
						stats.passed--;
					}
					else if (previousStatus === 'pending')
					{
						this.#pending--;
						stats.pending--;
					}

					this.#failed++;
					stats.failed++;
				}

				this.#updateLine(existing);
			}

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

	#appendLine(key: string, status: BrowserStatus, fullPath: string, duration?: number, browser?: string): void
	{
		if (!this.#hasResults)
		{
			this.#hasResults = true;
			this.#onStatus('');

			// Leave room for task runner lines above and status bar below.
			// Use a generous margin so the viewport never exceeds terminal height.
			this.#viewportHeight = Math.max(3, (process.stdout.rows ?? 24) - 6);

			// Hide cursor during live rendering
			process.stdout.write('\x1B[?25l');
		}

		const browsers = new Map<string, BrowserStatus>();
		if (browser)
		{
			browsers.set(browser, status);
		}

		const live: LiveLine = {
			status,
			fullPath,
			duration,
			browsers,
			row: this.#lines.length,
		};
		this.#liveLines.set(key, live);
		this.#lines.push(live);

		if (!isTTY)
		{
			process.stdout.write(this.#formatLine(live) + '\n');
			return;
		}

		this.#renderViewport();
	}

	#updateLine(_live: LiveLine): void
	{
		if (!isTTY)
		{
			return;
		}

		this.#renderViewport();
	}

	#viewportRenderedLines = 0;

	#renderViewport(): void
	{
		const total = this.#lines.length;
		const visibleCount = Math.min(total, this.#viewportHeight);

		// Visible test lines (tail of the list)
		const startIndex = total - visibleCount;
		const visibleLines: string[] = [];
		for (let i = startIndex; i < total; i++)
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
		const total = this.#passed + this.#failed + this.#pending;
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

		const elapsed = formatDuration(Date.now() - this.#startTime);

		return `${PREFIX} ${parts.join(chalk.gray('  '))} ${chalk.gray(`of ${total}`)} ${chalk.gray('·')} ${elapsed}`;
	}

	#formatLine(live: LiveLine): string
	{
		const { status, fullPath, duration, browsers } = live;
		const isComplete = browsers.size >= this.#expectedBrowsers;

		const durationStr = typeof duration === 'number'
			? ' ' + formatDuration(duration)
			: '';
		const browserTag = browsers.size > 0
			? ' ' + formatBrowserTag(browsers)
			: '';

		if (!isComplete && status !== 'pending')
		{
			return `${PREFIX} ${chalk.gray('◌')} ${chalk.dim(fullPath)}${durationStr}${browserTag}`;
		}

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

	finish(consoleLogs: ConsoleLog[] = []): { passed: number; failed: number; failures: FailedTestGroup[] }
	{
		const wallTime = Date.now() - this.#startTime;
		const total = this.#passed + this.#failed + this.#pending;
		const failures = this.#groupFailedTests();

		// Clear status line — covers the case where no TEST_* tokens arrived
		// (empty describe blocks, suites without any tests).
		this.#onStatus('');

		// Clear live viewport and print full report
		if (isTTY && this.#viewportRenderedLines > 0)
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

		lines.push('');
		console.log(lines.join('\n'));

		return { passed: this.#passed, failed: this.#failed, failures };
	}
}
