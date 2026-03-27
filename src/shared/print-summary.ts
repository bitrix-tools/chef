import chalk from 'chalk';

import { pluralize } from '../utils/pluralize';

import type { TaskGroupResult } from '../modules/task/task-types';

const LABEL_WIDTH = 12;

type ExtensionIssues = {
	name: string;
	errors: number;
	warnings: number;
};

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

export function printSummary(results: TaskGroupResult[], startTime: number): void
{
	if (results.length <= 1)
	{
		return;
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

	const passed = results.filter((r) => r.failed === 0 && r.warnings === 0).length;
	const failed = results.filter((r) => r.failed > 0).length;
	const warned = results.filter((r) => r.failed === 0 && r.warnings > 0).length;

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

	const total = passed + failed + warned;
	const duration = ((Date.now() - startTime) / 1000).toFixed(2);

	console.log('');
	console.log(`   ${chalk.gray('-'.repeat(60))}`);
	console.log(`   ${chalk.bold('Extensions'.padEnd(LABEL_WIDTH))}${summaryParts.join(chalk.gray(' | '))} ${chalk.gray(`(${total})`)}`);
	console.log(`   ${chalk.bold('Time'.padEnd(LABEL_WIDTH))}${duration}s`);
}
