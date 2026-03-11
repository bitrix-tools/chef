import * as fs from 'node:fs';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import type { TestToken, ConsoleLog } from './test-types';

const SLOW_TEST_THRESHOLD = 75;
const PREFIX = '    ';
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

type LiveLine = {
	status: BrowserStatus;
	fullPath: string;
	duration?: number;
	browsers: Map<string, BrowserStatus>;
	row: number;
};

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
	#spinner: Ora;
	#hasResults = false;
	#expectedBrowsers = 1;
	#viewportHeight = 0;

	#passed = 0;
	#failed = 0;
	#pending = 0;

	constructor()
	{
		this.#startTime = Date.now();
		this.#spinner = ora({
			text: 'Preparing tests...',
			spinner: 'dots',
			prefixText: PREFIX,
		});
		this.#spinner.start();
	}

	setBrowserCount(count: number): void
	{
		this.#expectedBrowsers = count;
	}

	stop(): void
	{
		this.#spinner.stop();

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
				.join(chalk.gray(' · '));

			this.#spinner.text = parts;
		}
		else
		{
			this.#spinner.text = status;
		}
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
			this.#spinner.stop();

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

	#groupFailedTests(): Array<{
		suitePath: string;
		title: string;
		browsers: string[];
		error?: { message: string; stack?: string };
		showDiff?: boolean;
		actual?: unknown;
		expected?: unknown;
	}>
	{
		const groups = new Map<string, {
			suitePath: string;
			title: string;
			browsers: string[];
			error?: { message: string; stack?: string };
			showDiff?: boolean;
			actual?: unknown;
			expected?: unknown;
		}>();

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

	finish(consoleLogs: ConsoleLog[] = []): { passed: number; failed: number }
	{
		const wallTime = Date.now() - this.#startTime;
		const total = this.#passed + this.#failed + this.#pending;

		this.#spinner.stop();

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

		// Failed test details (grouped by path)
		if (this.#failedTests.length > 0)
		{
			const grouped = this.#groupFailedTests();

			lines.push('');
			lines.push(`${PREFIX} ${chalk.red.bold(`Failed Tests (${grouped.length}):`)}`);

			for (let idx = 0; idx < grouped.length; idx++)
			{
				const group = grouped[idx];
				const browsers = group.browsers.length > 0
					? chalk.dim(` [${group.browsers.join(' · ')}]`)
					: '';
				const path = group.suitePath ? `${group.suitePath} > ${group.title}` : group.title;
				const counter = chalk.dim(`${idx + 1}/${grouped.length}`);

				lines.push('');
				if (idx > 0)
				{
					lines.push(`${PREFIX} ${chalk.dim('─'.repeat(40))}`);
					lines.push('');
				}
				lines.push(`${PREFIX} ${counter} ${chalk.red(path)}${browsers}`);
				lines.push('');

				const hasDiff = group.showDiff && group.actual !== undefined && group.expected !== undefined;

				if (group.error?.message)
				{
					const message = stripAnsi(group.error.message);
					const styledLines = styleErrorMessage(message);
					for (const styledLine of styledLines)
					{
						lines.push(`${PREFIX}   ${styledLine}`);
					}
				}

				if (hasDiff)
				{
					lines.push('');
					const diffLines = renderDiff(group.actual, group.expected);
					for (const diffLine of diffLines)
					{
						lines.push(`${PREFIX}   ${diffLine}`);
					}
				}

				if (group.error?.stack)
				{
					const stackLines = formatStack(group.error.stack);
					if (stackLines.length > 0)
					{
						lines.push('');
						for (const stackLine of stackLines)
						{
							lines.push(`${PREFIX}   ${stackLine}`);
						}
					}
				}
			}
		}

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

		// Console output
		if (consoleLogs.length > 0)
		{
			lines.push('');
			lines.push(`${PREFIX} ${chalk.bold('Console output:')}`);
			for (const log of consoleLogs)
			{
				const prefix = log.type === 'error' ? chalk.red('error')
					: log.type === 'warning' ? chalk.yellow('warn')
					: chalk.gray('log');
				lines.push(`${PREFIX} ${chalk.gray('[')}${prefix}${chalk.gray(']')} ${log.text}`);
			}
		}

		lines.push('');
		console.log(lines.join('\n'));

		return { passed: this.#passed, failed: this.#failed };
	}
}

function styleErrorMessage(message: string): string[]
{
	const lines = message.split('\n');
	const result: string[] = [];

	for (const line of lines)
	{
		const trimmed = line.trimStart();

		// Code frame: "> 35 | code" — error line
		if (/^>\s*\d+\s*\|/.test(trimmed))
		{
			const pipeIndex = line.indexOf('|');
			const prefix = line.slice(line.indexOf('>') + 1, pipeIndex);
			result.push(chalk.red('>') + chalk.dim(prefix) + chalk.gray('|') + line.slice(pipeIndex + 1));
			continue;
		}

		// Code frame: "  35 | code" — context line
		if (/^\d+\s*\|/.test(trimmed))
		{
			const pipeIndex = line.indexOf('|');
			result.push(chalk.dim(line.slice(0, pipeIndex)) + chalk.gray('|') + line.slice(pipeIndex + 1));
			continue;
		}

		// Code frame: "     | ^" — pointer line
		if (/^\s*\|\s*\^/.test(line))
		{
			const pipeIndex = line.indexOf('|');
			result.push(line.slice(0, pipeIndex) + chalk.gray('|') + chalk.red(line.slice(pipeIndex + 1)));
			continue;
		}

		// "at /path/to/file:line:col"
		if (/^\s*at\s+\//.test(line))
		{
			const match = line.match(/at\s+(\/\S+)/);
			result.push(match ? `  at ${match[1]}` : line);
			continue;
		}

		// "Expected" / "Expected:" / "Expected pattern:" etc.
		if (/^Expected\b/.test(trimmed))
		{
			result.push(chalk.green(line));
			continue;
		}

		// "Received" / "Received:" / "Received string:" etc.
		if (/^Received\b/.test(trimmed))
		{
			result.push(chalk.red(line));
			continue;
		}

		// Everything else — dim
		result.push(chalk.dim(line));
	}

	return result;
}

export function stripAnsi(text: string): string
{
	// eslint-disable-next-line no-control-regex
	return text.replace(/\x1B\[[0-9;]*m/g, '');
}

export function hasLocalFilePath(stack?: string): boolean
{
	if (!stack)
	{
		return false;
	}

	// Match /absolute/path:line:col but not //cdn... or http://...
	const match = stack.match(/(\/[^\s:()]+):\d+:\d+/);

	return !!match && !match[1].startsWith('//') && !match[1].includes('://');
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

function formatStack(stack: string): string[]
{
	const lines = stack.split('\n');

	for (const line of lines)
	{
		const fileMatch = line.match(/(\/[^\s:()]+):(\d+):(\d+)/);
		if (fileMatch)
		{
			const [, filePath, lineStr, colStr] = fileMatch;

			// Skip URLs (CDN paths like //cdn.jsdelivr.net/...)
			if (filePath.startsWith('//') || filePath.includes('://'))
			{
				continue;
			}

			const errorLine = Number(lineStr);
			const errorCol = Number(colStr);

			const result: string[] = [];
			result.push(...renderCodeFrame(filePath, errorLine, errorCol));
			result.push('');
			result.push(`  at ${filePath}:${lineStr}:${colStr}`);

			return result;
		}
	}

	return [];
}

function renderCodeFrame(filePath: string, errorLine: number, errorCol: number): string[]
{
	let fileContent: string;
	try
	{
		fileContent = fs.readFileSync(filePath, 'utf-8');
	}
	catch
	{
		return [];
	}

	const sourceLines = fileContent.split('\n');
	const contextSize = 2;
	const start = Math.max(0, errorLine - contextSize - 1);
	const end = Math.min(sourceLines.length, errorLine + contextSize);
	const padWidth = String(end).length;

	// Expand tabs and find minimum common indent
	const expandedLines: string[] = [];
	for (let i = start; i < end; i++)
	{
		expandedLines.push(sourceLines[i].replaceAll('\t', '    '));
	}

	const minIndent = expandedLines.reduce((min, line) => {
		if (line.trim().length === 0)
		{
			return min;
		}

		const indent = line.match(/^(\s*)/)?.[1].length ?? 0;

		return Math.min(min, indent);
	}, Infinity);

	const strip = minIndent === Infinity ? 0 : minIndent;

	const result: string[] = [];

	for (let i = start; i < end; i++)
	{
		const lineNum = String(i + 1).padStart(padWidth);
		const sourceLine = expandedLines[i - start].slice(strip);

		if (i + 1 === errorLine)
		{
			result.push(`${chalk.red('>')} ${chalk.dim(lineNum)} ${chalk.gray('|')} ${sourceLine}`);

			// Convert source column to expanded column (tabs → 4 spaces)
			const rawLine = sourceLines[i];
			let expandedCol = 0;
			for (let c = 0; c < errorCol - 1 && c < rawLine.length; c++)
			{
				expandedCol += rawLine[c] === '\t' ? 4 : 1;
			}

			const pointer = ' '.repeat(Math.max(0, expandedCol - strip)) + '^';
			result.push(`  ${' '.repeat(padWidth)} ${chalk.gray('|')} ${chalk.red(pointer)}`);
		}
		else
		{
			result.push(`  ${chalk.dim(lineNum)} ${chalk.gray('|')} ${sourceLine}`);
		}
	}

	return result;
}

function stringify(value: unknown): string
{
	if (typeof value === 'string')
	{
		return value;
	}

	return JSON.stringify(value, null, 2) ?? String(value);
}

function isScalar(value: unknown): boolean
{
	return typeof value === 'string' || typeof value === 'number'
		|| typeof value === 'boolean' || value === null || value === undefined;
}

function renderDiff(actual: unknown, expected: unknown): string[]
{
	// For scalar values: simple Expected / Received (like Jest/Playwright)
	if (isScalar(actual) && isScalar(expected))
	{
		const expectedStr = stringify(expected);
		const actualStr = stringify(actual);

		return [
			...expectedStr.split('\n').map((line, i) =>
				chalk.green(i === 0 ? `Expected: ${line}` : `          ${line}`),
			),
			...actualStr.split('\n').map((line, i) =>
				chalk.red(i === 0 ? `Received: ${line}` : `          ${line}`),
			),
		];
	}

	// For objects/arrays: line-by-line diff (like Jest)
	const actualStr = stringify(actual);
	const expectedStr = stringify(expected);
	const actualLines = actualStr.split('\n');
	const expectedLines = expectedStr.split('\n');
	const maxLen = Math.max(actualLines.length, expectedLines.length);
	const lines: string[] = [];

	lines.push(`${chalk.green('- Expected')}  ${chalk.red('+ Received')}`);
	lines.push('');

	for (let i = 0; i < maxLen; i++)
	{
		const aLine = actualLines[i];
		const eLine = expectedLines[i];

		if (aLine === eLine)
		{
			lines.push(`    ${aLine}`);
		}
		else
		{
			if (eLine !== undefined)
			{
				lines.push(`  ${chalk.green('-')} ${chalk.green(eLine)}`);
			}
			if (aLine !== undefined)
			{
				lines.push(`  ${chalk.red('+')} ${chalk.red(aLine)}`);
			}
		}
	}

	return lines;
}
