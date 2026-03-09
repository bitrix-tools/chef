import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import logUpdate from 'log-update';
import type { TestToken, ConsoleLog } from './test-types';

const SLOW_TEST_THRESHOLD = 75;
const PREFIX = '    ';

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

export class TestReporter
{
	readonly #suiteStacks = new Map<string, string[]>();
	readonly #suiteStats = new Map<string, SuiteStats>();
	readonly #failedTests: FailedTest[] = [];
	readonly #slowTests: SlowTest[] = [];
	readonly #browsers = new Set<string>();
	readonly #startTime: number;
	#spinner: Ora;

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

		if (token.id === 'TEST_PASSED' || token.id === 'TEST_FAILED')
		{
			const suiteName = stack[0] ?? '';
			const suitePath = stack.join(' > ');
			const fullPath = suitePath ? `${suitePath} > ${token.title}` : (token.title ?? '');

			if (!this.#suiteStats.has(suiteName))
			{
				this.#suiteStats.set(suiteName, { passed: 0, failed: 0, pending: 0, duration: 0 });
			}

			const stats = this.#suiteStats.get(suiteName)!;
			stats.duration += token.duration ?? 0;

			if (token.id === 'TEST_PASSED')
			{
				this.#passed++;
				stats.passed++;
			}
			else
			{
				this.#failed++;
				stats.failed++;
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

			if (typeof token.duration === 'number' && token.duration > SLOW_TEST_THRESHOLD)
			{
				this.#slowTests.push({ title: fullPath, duration: token.duration, browser });
			}

			this.#updateSpinner(fullPath);
		}

		if (token.id === 'TEST_PENDING')
		{
			this.#pending++;

			const suiteName = stack[0] ?? '';
			if (!this.#suiteStats.has(suiteName))
			{
				this.#suiteStats.set(suiteName, { passed: 0, failed: 0, pending: 0, duration: 0 });
			}

			this.#suiteStats.get(suiteName)!.pending++;
		}
	}

	#updateSpinner(currentTest: string): void
	{
		const total = this.#passed + this.#failed + this.#pending;
		const parts = [
			this.#passed > 0 ? chalk.green(`${this.#passed} passed`) : null,
			this.#failed > 0 ? chalk.red(`${this.#failed} failed`) : null,
		].filter(Boolean);

		const progress = `${parts.join(chalk.gray(' | '))} ${chalk.gray(`(${total})`)}`;
		const testName = currentTest.length > 50
			? currentTest.slice(0, 47) + '...'
			: currentTest;

		this.#spinner.text = `${progress} ${chalk.gray('—')} ${chalk.dim(testName)}`;
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
			const key = `${path}::${test.error?.message ?? ''}`;

			if (groups.has(key))
			{
				if (test.browser)
				{
					groups.get(key)!.browsers.push(test.browser);
				}
			}
			else
			{
				groups.set(key, {
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

		const lines: string[] = [];

		// Suites summary
		for (const [suiteName, stats] of this.#suiteStats)
		{
			const suiteTotal = stats.passed + stats.failed + stats.pending;
			const duration = formatDuration(stats.duration);

			if (stats.failed > 0)
			{
				const counts = [
					stats.passed > 0 ? chalk.green(`${stats.passed} passed`) : null,
					chalk.red(`${stats.failed} failed`),
					stats.pending > 0 ? chalk.yellow(`${stats.pending} pending`) : null,
				].filter(Boolean).join(chalk.gray(' | '));

				lines.push(`${PREFIX} ${chalk.red('✖')} ${chalk.bold(suiteName)} ${chalk.gray(`(${counts})`)} ${duration}`);
			}
			else
			{
				const pendingStr = stats.pending > 0 ? ` | ${stats.pending} pending` : '';
				lines.push(`${PREFIX} ${chalk.green('✓')} ${suiteName} ${chalk.gray(`(${suiteTotal} tests${pendingStr})`)} ${duration}`);
			}
		}

		// Failed test details (grouped by path + error)
		if (this.#failedTests.length > 0)
		{
			lines.push('');
			lines.push(`${PREFIX} ${chalk.red.bold('Failed Tests:')}`);

			const grouped = this.#groupFailedTests();

			for (const group of grouped)
			{
				const browsers = group.browsers.length > 0
					? chalk.dim(` [${group.browsers.join(' · ')}]`)
					: '';
				const path = group.suitePath ? `${group.suitePath} > ${group.title}` : group.title;

				lines.push('');
				lines.push(`${PREFIX} ${chalk.red('✖')} ${chalk.red(path)}${browsers}`);

				if (group.error?.message)
				{
					lines.push(`${PREFIX}   ${chalk.dim(group.error.message)}`);
				}

				if (group.error?.stack)
				{
					const stackLines = formatStack(group.error.stack);
					for (const stackLine of stackLines)
					{
						lines.push(`${PREFIX}   ${stackLine}`);
					}
				}

				if (group.showDiff && group.actual !== undefined && group.expected !== undefined)
				{
					lines.push('');
					const diffLines = renderDiff(group.actual, group.expected);
					for (const diffLine of diffLines)
					{
						lines.push(`${PREFIX}   ${diffLine}`);
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
	const result: string[] = [];

	for (const line of lines)
	{
		// Extract file path with line:col from stack frame
		const fileMatch = line.match(/(\/[^\s:()]+:\d+:\d+)/);
		if (fileMatch)
		{
			result.push(`file://${fileMatch[1]}`);
		}

		// Show only the first relevant frame
		if (result.length >= 1)
		{
			break;
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

function renderDiff(actual: unknown, expected: unknown): string[]
{
	const actualLines = stringify(actual).split('\n');
	const expectedLines = stringify(expected).split('\n');
	const maxLen = Math.max(actualLines.length, expectedLines.length);
	const padWidth = String(maxLen).length;
	const pad = ' '.repeat(padWidth);
	const lines: string[] = [];

	lines.push(`${pad}   ${chalk.red('- actual')}  ${chalk.green('+ expected')}`);
	lines.push('');

	for (let i = 0; i < maxLen; i++)
	{
		const lineNum = chalk.gray(String(i + 1).padStart(padWidth));
		const aLine = actualLines[i];
		const eLine = expectedLines[i];

		if (aLine === eLine)
		{
			lines.push(`${lineNum} ${chalk.gray('│')}   ${aLine ?? ''}`);
		}
		else
		{
			if (aLine !== undefined)
			{
				lines.push(`${lineNum} ${chalk.gray('│')} ${chalk.red('-')} ${chalk.red(aLine)}`);
			}
			if (eLine !== undefined)
			{
				lines.push(`${chalk.gray(pad)} ${chalk.gray('│')} ${chalk.green('+')} ${chalk.green(eLine)}`);
			}
		}
	}

	return lines;
}
