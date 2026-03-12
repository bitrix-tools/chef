import chalk from 'chalk';

import { formatError } from '../../utils/error-formatter';

import type { TaskResult, TaskDetail, TaskGroupResult } from './task-types';

const isTTY = process.stdout.isTTY ?? false;

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
const SPINNER_INTERVAL = 100;

function formatDuration(ms: number): string
{
	return `${(ms / 1000).toFixed(2)}s`;
}

function statusIcon(status: TaskResult['status']): string
{
	if (status === 'passed')
	{
		return chalk.green('✓');
	}

	if (status === 'failed')
	{
		return chalk.red('✗');
	}

	return chalk.yellow('⚠');
}

function renderDetail(detail: TaskDetail, indent: string): string
{
	if (detail.type === 'item')
	{
		return detail.text.split('\n')
			.map((line) => `${indent}${line}`)
			.join('\n');
	}

	if (detail.type === 'error')
	{
		return formatError(detail, indent).join('\n');
	}

	const colorFn = detail.color && typeof chalk[detail.color as keyof typeof chalk] === 'function'
		? (chalk as any)[detail.color]
		: (str: string) => str;

	return detail.text.split('\n')
		.map((line) => `${indent}${colorFn('│')} ${line}`)
		.join('\n');
}

export class TaskReporter
{
	readonly #results: TaskResult[] = [];
	readonly #startTime: number;
	readonly #groupTitle: string;
	readonly #isGroup: boolean;
	readonly #taskPrefix: string;
	readonly #detailPrefix: string;
	#spinnerTimer: ReturnType<typeof setInterval> | null = null;
	#spinnerFrame = 0;
	#spinnerText = '';
	#titlePrinted = false;
	#passed = 0;
	#failed = 0;
	#warnings = 0;

	constructor(groupTitle: string, taskCount: number)
	{
		this.#startTime = Date.now();
		this.#groupTitle = groupTitle;
		this.#isGroup = taskCount > 1;

		//  Single task:  " ✓ title"  details: "   text"
		//  Group task:   "   ✓ title"  details: "     text"
		this.#taskPrefix = this.#isGroup ? '   ' : ' ';
		this.#detailPrefix = this.#isGroup ? '     ' : '   ';
	}

	startTask(title: string): void
	{
		this.#printTitle();
		this.#spinnerText = title;
		this.#spinnerFrame = 0;

		if (isTTY)
		{
			this.#renderSpinner();
			this.#spinnerTimer = setInterval(() => this.#renderSpinner(), SPINNER_INTERVAL);
		}
	}

	updateTask(message: string): void
	{
		this.#spinnerText = message;
	}

	completeTask(result: TaskResult): void
	{
		this.#stopSpinner();
		this.#results.push(result);

		if (result.status === 'passed')
		{
			this.#passed++;
		}
		else if (result.status === 'failed')
		{
			this.#failed++;
		}
		else
		{
			this.#warnings++;
		}

		console.log(`${this.#taskPrefix}${statusIcon(result.status)} ${result.title}`);

		if (result.details)
		{
			const errorDetails = result.details.filter((d) => d.type === 'error');
			const errorCount = errorDetails.length;
			let errorIndex = 0;

			for (const detail of result.details)
			{
				if (detail.type === 'error' && errorCount > 1)
				{
					errorIndex++;
					if (errorIndex > 1)
					{
						console.log('');
						console.log(`${this.#detailPrefix}${chalk.dim('─'.repeat(40))}`);
					}
					console.log('');

					const counterText = `${errorIndex}/${errorCount}`;
					const counter = chalk.dim(counterText);

					const shortMessage = detail.message
						.replace(/^.*?\(\d+:\d+\):\s*/, '');
					console.log(`${this.#detailPrefix}${counter} ${shortMessage}`);

					const errorLines = formatError({ ...detail, message: '' }, this.#detailPrefix);
					if (errorLines.length > 0)
					{
						console.log('');
						console.log(errorLines.join('\n'));
					}
				}
				else
				{
					console.log(renderDetail(detail, this.#detailPrefix));
				}
			}
		}
	}

	finish(): TaskGroupResult
	{
		this.#stopSpinner();
		this.#printTitle();

		const duration = Date.now() - this.#startTime;
		const total = this.#passed + this.#failed + this.#warnings;

		if (total > 1)
		{
			console.log('');

			const summaryParts: string[] = [];

			if (this.#passed > 0)
			{
				summaryParts.push(chalk.green.bold(`${this.#passed} passed`));
			}

			if (this.#failed > 0)
			{
				summaryParts.push(chalk.red.bold(`${this.#failed} failed`));
			}

			if (this.#warnings > 0)
			{
				summaryParts.push(chalk.yellow(`${this.#warnings} warnings`));
			}

			console.log(`${this.#taskPrefix}${chalk.bold('Tasks')}  ${summaryParts.join(chalk.gray(' | '))} ${chalk.gray(`(${total})`)}`);
			console.log(`${this.#taskPrefix} ${chalk.bold('Time')}  ${formatDuration(duration)}`);
		}

		console.log('');

		return {
			title: this.#groupTitle,
			results: this.#results,
			passed: this.#passed,
			failed: this.#failed,
			warnings: this.#warnings,
			duration,
		};
	}

	#printTitle(): void
	{
		if (!this.#titlePrinted)
		{
			this.#titlePrinted = true;

			if (this.#isGroup)
			{
				console.log(` ${chalk.bold(this.#groupTitle)}`);
			}
		}
	}

	#renderSpinner(): void
	{
		const colorFn = SPINNER_COLORS[this.#spinnerFrame % SPINNER_COLORS.length];
		this.#spinnerFrame++;

		process.stdout.write(`\r\x1B[2K${this.#taskPrefix}${colorFn('○')} ${this.#spinnerText}`);
	}

	#stopSpinner(): void
	{
		if (this.#spinnerTimer)
		{
			clearInterval(this.#spinnerTimer);
			this.#spinnerTimer = null;
		}

		if (isTTY)
		{
			process.stdout.write('\r\x1B[2K');
		}
	}
}
