import chalk from 'chalk';
import { TASK_STATUS_ICON } from '../../task/icons';
import type { TestToken, ConsoleLog } from './test-types';

const SLOW_TEST_THRESHOLD = 75;

type SuiteNode = {
	title: string;
	passed: number;
	failed: number;
	pending: number;
	duration: number;
	failedTests: TestToken[];
	children: SuiteNode[];
};

export function buildSuiteTree(report: TestToken[]): SuiteNode
{
	const root: SuiteNode = {
		title: '',
		passed: 0,
		failed: 0,
		pending: 0,
		duration: 0,
		failedTests: [],
		children: [],
	};

	const stack: SuiteNode[] = [root];

	for (const token of report)
	{
		const current = stack[stack.length - 1];

		if (token.id === 'SUITE_START' && !token.root)
		{
			const suite: SuiteNode = {
				title: token.title ?? '',
				passed: 0,
				failed: 0,
				pending: 0,
				duration: 0,
				failedTests: [],
				children: [],
			};

			current.children.push(suite);
			stack.push(suite);
		}

		if (token.id === 'SUITE_END' && !token.root)
		{
			const finished = stack.pop()!;
			const parent = stack[stack.length - 1];
			parent.passed += finished.passed;
			parent.failed += finished.failed;
			parent.pending += finished.pending;
			parent.duration += finished.duration;
		}

		if (token.id === 'TEST_PASSED')
		{
			current.passed++;
			current.duration += token.duration ?? 0;
		}

		if (token.id === 'TEST_FAILED')
		{
			current.failed++;
			current.duration += token.duration ?? 0;
			current.failedTests.push(token);
		}

		if (token.id === 'TEST_PENDING')
		{
			current.pending++;
		}
	}

	return root;
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

function renderSuiteTree(suite: SuiteNode, depth: number = 0): string[]
{
	const lines: string[] = [];
	const indent = '  '.repeat(depth);

	for (const child of suite.children)
	{
		const hasFailed = child.failed > 0;
		const durationStr = child.duration > 0 ? ` ${formatDuration(child.duration)}` : '';

		if (hasFailed)
		{
			const counts = [
				child.passed > 0 ? chalk.green(`${child.passed} passed`) : '',
				chalk.red(`${child.failed} failed`),
				child.pending > 0 ? chalk.yellow(`${child.pending} pending`) : '',
			].filter(Boolean).join(chalk.gray(', '));

			lines.push(`${indent}${chalk.red(TASK_STATUS_ICON.fail)} ${chalk.bold(child.title)} ${chalk.gray('(')}${counts}${chalk.gray(')')}${durationStr}`);

			for (const failedTest of child.failedTests)
			{
				lines.push(`${indent}  ${chalk.red(TASK_STATUS_ICON.fail)} ${chalk.red(failedTest.title)}`);
				if (failedTest.error?.message)
				{
					lines.push(`${indent}    ${chalk.dim(failedTest.error.message)}`);
				}

				if (failedTest.showDiff && failedTest.actual !== undefined && failedTest.expected !== undefined)
				{
					lines.push('');
					const diffLines = renderDiff(failedTest.actual, failedTest.expected);
					for (const diffLine of diffLines)
					{
						lines.push(`${indent}    ${diffLine}`);
					}
					lines.push('');
				}
			}

			if (child.children.length > 0)
			{
				lines.push(...renderSuiteTree(child, depth + 1));
			}
		}
		else
		{
			const countStr = chalk.green(`${child.passed} passed`);
			const pendingStr = child.pending > 0 ? chalk.gray(`, ${child.pending} pending`) : '';
			lines.push(`${indent}${chalk.green(TASK_STATUS_ICON.success)} ${child.title} ${chalk.gray('(')}${countStr}${pendingStr}${chalk.gray(')')}${durationStr}`);

			if (child.children.length > 0)
			{
				lines.push(...renderSuiteTree(child, depth + 1));
			}
		}
	}

	return lines;
}

function getSlowTests(report: TestToken[], limit: number = 3): TestToken[]
{
	return report
		.filter((token) => {
			return (token.id === 'TEST_PASSED' || token.id === 'TEST_FAILED')
				&& typeof token.duration === 'number'
				&& token.duration > SLOW_TEST_THRESHOLD;
		})
		.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
		.slice(0, limit);
}

export function renderReport(report: TestToken[], consoleLogs: ConsoleLog[], wallTime: number): string
{
	const tree = buildSuiteTree(report);
	const { passed, failed, pending } = tree;
	const total = passed + failed + pending;
	const lines: string[] = [];

	// Suite tree
	lines.push(...renderSuiteTree(tree, 1));

	// Summary line
	lines.push('');
	const summaryParts = [
		passed > 0 ? chalk.green.bold(`${passed} passed`) : null,
		failed > 0 ? chalk.red.bold(`${failed} failed`) : null,
		pending > 0 ? chalk.yellow(`${pending} pending`) : null,
	].filter(Boolean);

	lines.push(`  ${chalk.bold('Tests:')}  ${summaryParts.join(chalk.gray('  ·  '))} ${chalk.gray(`of ${total}`)}`);
	lines.push(`  ${chalk.bold('Time:')}   ${formatDuration(wallTime)}`);

	// Slow tests
	const slowTests = getSlowTests(report);
	if (slowTests.length > 0)
	{
		lines.push('');
		lines.push(`  ${chalk.yellow.bold('Slow tests:')}`);
		for (const test of slowTests)
		{
			lines.push(`    ${chalk.yellow(`${test.duration}ms`)} ${chalk.gray('→')} ${test.title}`);
		}
	}

	// Console output
	if (consoleLogs?.length > 0)
	{
		lines.push('');
		lines.push(`  ${chalk.bold('Console output:')}`);
		for (const log of consoleLogs)
		{
			const prefix = log.type === 'error' ? chalk.red('error')
				: log.type === 'warning' ? chalk.yellow('warn')
				: chalk.gray('log');
			lines.push(`  ${chalk.gray('[')}${prefix}${chalk.gray(']')} ${log.text}`);
		}
	}

	lines.push('');

	return lines.join('\n');
}
