import chalk from 'chalk';

import { pluralize } from '../utils/pluralize';
import { formatElapsed } from '../utils/format-elapsed';
import { formatError } from '../diagnostics/format-error';
import { stripAnsi } from '../diagnostics/code-frame';

import type { TaskGroupResult, TaskFailure } from '../modules/task/task-types';

const LABEL_WIDTH = 12;
const PREFIX = '   ';

type ExtensionIssues = {
	name: string;
	errors: number;
	warnings: number;
};

type ExtensionTestFailures = {
	name: string;
	failures: TaskFailure[];
};

type ExtensionBuildError = {
	name: string;
	code?: string;
	message: string;
};

function collectTestFailures(results: TaskGroupResult[]): ExtensionTestFailures[]
{
	const collected: ExtensionTestFailures[] = [];

	for (const group of results)
	{
		const failures: TaskFailure[] = [];
		for (const task of group.results)
		{
			if (task.metrics?.failures && task.metrics.failures.length > 0)
			{
				failures.push(...task.metrics.failures);
			}
		}

		if (failures.length > 0)
		{
			collected.push({ name: group.title, failures });
		}
	}

	return collected;
}

function collectBuildErrors(results: TaskGroupResult[]): ExtensionBuildError[]
{
	const collected: ExtensionBuildError[] = [];

	for (const group of results)
	{
		for (const task of group.results)
		{
			if (task.status !== 'failed' || !task.details)
			{
				continue;
			}

			for (const detail of task.details)
			{
				if (detail.type !== 'error')
				{
					continue;
				}

				collected.push({
					name: group.title,
					code: detail.code,
					message: detail.message,
				});
			}
		}
	}

	return collected;
}

function printTestFailures(extensions: ExtensionTestFailures[]): void
{
	const total = extensions.reduce((acc, ext) => acc + ext.failures.length, 0);

	console.log(`   ${chalk.red.bold(`Failed Tests (${total}):`)}`);

	let isFirst = true;
	for (const { name, failures } of extensions)
	{
		for (const group of failures)
		{
			console.log('');
			if (!isFirst)
			{
				console.log(`   ${chalk.dim('─'.repeat(40))}`);
				console.log('');
			}
			isFirst = false;

			const browsers = group.browsers.length > 0
				? chalk.dim(` [${group.browsers.join(' · ')}]`)
				: '';
			const path = group.suitePath ? `${group.suitePath} > ${group.title}` : group.title;
			console.log(`   ${chalk.dim(name)} ${chalk.gray('›')} ${chalk.red(path)}${browsers}`);

			const errorLines = formatError({
				message: group.error?.message ? stripAnsi(group.error.message) : '',
				stack: group.error?.stack,
				showDiff: group.showDiff,
				actual: group.actual,
				expected: group.expected,
			}, PREFIX);

			if (errorLines.length > 0)
			{
				console.log('');
				console.log(errorLines.join('\n'));
			}
		}
	}
}

function printBuildErrors(errors: ExtensionBuildError[]): void
{
	console.log(`   ${chalk.red.bold(`Errors (${errors.length}):`)}`);
	console.log('');

	for (const { name, code, message } of errors)
	{
		const codePrefix = code ? chalk.red(`[${code}]`) + ' ' : '';
		console.log(`   ${chalk.dim(name)} ${chalk.gray('›')} ${codePrefix}${message}`);
	}
}

function collectIssues(results: TaskGroupResult[]): ExtensionIssues[]
{
	const issues: ExtensionIssues[] = [];

	for (const group of results)
	{
		if (group.failed === 0 && group.warnings === 0)
		{
			continue;
		}

		let errors = 0;
		let warnings = 0;

		for (const task of group.results)
		{
			if (!task.details)
			{
				continue;
			}

			for (const detail of task.details)
			{
				if (detail.type !== 'error')
				{
					continue;
				}

				if (task.status === 'failed')
				{
					errors++;
				}
				else if (task.status === 'warning')
				{
					warnings++;
				}
			}
		}

		if (errors > 0 || warnings > 0)
		{
			issues.push({ name: group.title, errors, warnings });
		}
	}

	return issues;
}

export function printSummary(
	results: TaskGroupResult[],
	startTime: number,
	options: { isTestRun?: boolean; unitLabel?: string } = {},
): void
{
	const hasMetrics = results.some((g) => g.results.some((t) => t.metrics !== undefined));
	const isTestRun = options.isTestRun ?? hasMetrics;
	const unitLabel = options.unitLabel ?? 'Extensions';

	if (!isTestRun && results.length <= 1)
	{
		return;
	}

	if (isTestRun)
	{
		const testFailures = collectTestFailures(results);
		if (testFailures.length > 0)
		{
			printTestFailures(testFailures);
		}

		const buildErrors = collectBuildErrors(results);
		if (buildErrors.length > 0)
		{
			printBuildErrors(buildErrors);
		}
	}

	const issues = collectIssues(results);

	if (issues.length > 0)
	{
		const maxNameLength = Math.max(...issues.map((i) => i.name.length));

		console.log('');
		let isFirst = true;
		for (const { name, errors, warnings } of issues)
		{
			const parts: string[] = [];
			if (errors > 0)
			{
				parts.push(chalk.red(pluralize(' error', errors)));
			}
			if (warnings > 0)
			{
				parts.push(chalk.yellow(pluralize(' warning', warnings)));
			}

			const label = isFirst ? chalk.bold('Issues'.padEnd(LABEL_WIDTH)) : ' '.repeat(LABEL_WIDTH);
			console.log(`   ${label}${chalk.dim(name.padEnd(maxNameLength))}  ${parts.join(chalk.gray(' · '))}`);
			isFirst = false;
		}
	}

	const failed = results.filter((r) => r.failed > 0).length;
	const warned = results.filter((r) => r.failed === 0 && r.warnings > 0).length;
	// A group with no passed tasks and nothing but skipped ones (e.g. a module
	// or extension that has no test files) is "skipped", not a green "passed".
	const skipped = results.filter((r) => r.failed === 0 && r.warnings === 0 && r.passed === 0 && r.skipped > 0).length;
	const passed = results.length - failed - warned - skipped;

	const summaryParts: string[] = [];
	if (passed > 0)
	{
		summaryParts.push(chalk.green.bold(`${passed} passed`));
	}
	if (failed > 0)
	{
		summaryParts.push(chalk.red.bold(`${failed} failed`));
	}
	if (warned > 0)
	{
		summaryParts.push(chalk.yellow(pluralize(' warning', warned)));
	}
	if (skipped > 0)
	{
		summaryParts.push(chalk.gray(`${skipped} skipped`));
	}

	const total = passed + failed + warned + skipped;
	const duration = formatElapsed(Date.now() - startTime);

	let testsPassed = 0;
	let testsFailed = 0;
	// Aggregate per-browser tallies across all extensions, preserving first-seen order.
	const browserOrder: string[] = [];
	const browserTotals = new Map<string, { passed: number; failed: number }>();
	for (const group of results)
	{
		for (const task of group.results)
		{
			if (task.metrics)
			{
				testsPassed += task.metrics.passed;
				testsFailed += task.metrics.failed;

				for (const browser of task.metrics.browsers ?? [])
				{
					if (!browserTotals.has(browser.name))
					{
						browserTotals.set(browser.name, { passed: 0, failed: 0 });
						browserOrder.push(browser.name);
					}
					const bt = browserTotals.get(browser.name)!;
					bt.passed += browser.passed;
					bt.failed += browser.failed;
				}
			}
		}
	}

	console.log('');
	console.log(`   ${chalk.gray('-'.repeat(60))}`);
	console.log(`   ${chalk.bold(unitLabel.padEnd(LABEL_WIDTH))}${summaryParts.join(chalk.gray(' | '))} ${chalk.gray(`(${total})`)}`);

	if (isTestRun)
	{
		const testsParts: string[] = [];
		if (testsPassed > 0)
		{
			testsParts.push(chalk.green.bold(`${testsPassed} passed`));
		}
		if (testsFailed > 0)
		{
			testsParts.push(chalk.red.bold(`${testsFailed} failed`));
		}

		if (testsParts.length > 0)
		{
			const testsTotal = testsPassed + testsFailed;
			console.log(`   ${chalk.bold('Tests'.padEnd(LABEL_WIDTH))}${testsParts.join(chalk.gray(' | '))} ${chalk.gray(`(${testsTotal})`)}`);
		}

		// Per-browser breakdown — only when more than one browser ran, so it adds
		// signal (which engine the failures are in) without noise for single-browser runs.
		if (browserOrder.length > 1)
		{
			const browserParts = browserOrder.map((name) => {
				const { passed, failed } = browserTotals.get(name)!;
				const tally = failed > 0
					? `${chalk.green(`${passed} ✓`)} ${chalk.red(`${failed} ✗`)}`
					: chalk.green(`${passed} ✓`);

				return `${chalk.dim(name)} ${tally}`;
			});

			console.log(`   ${chalk.bold('Browsers'.padEnd(LABEL_WIDTH))}${browserParts.join(chalk.gray('  ·  '))}`);
		}
	}

	console.log(`   ${chalk.bold('Time'.padEnd(LABEL_WIDTH))}${duration}`);
}
