import chalk from 'chalk';

import { hasCodeFrame } from '../../diagnostics/code-frame';
import { formatError, formatInternalError } from '../../diagnostics/format-error';
import {
	isBaselineCode,
	extractFeatureLabel,
	extractBrowsersStr,
	extractFeatureName,
	formatRiskLine,
	formatBrowserLines,
	formatCaniuseLink,
	formatCodeLabel,
} from '../../diagnostics/baseline-format';

import type { TaskResult, TaskDetail, TaskGroupResult } from './task-types';

type TaskError = Extract<TaskDetail, { type: 'error' }>;

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

	if (status === 'skipped')
	{
		return chalk.gray('—');
	}

	return chalk.yellow('⚠');
}

function isInternalError(error: TaskError): boolean
{
	return typeof error.code === 'string' && error.code.startsWith('CF9');
}

type TaskItem = Extract<TaskDetail, { type: 'item' }>;
type TaskBlock = Extract<TaskDetail, { type: 'block' }>;

function renderItem(detail: TaskItem, indent: string): string
{
	return detail.text.split('\n')
		.map((line) => `${indent}${line}`)
		.join('\n');
}

function renderBlock(detail: TaskBlock, indent: string): string
{
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
	readonly #showSummary: boolean;
	readonly #suppressErrorDetails: boolean;
	readonly #taskPrefix: string;
	readonly #detailPrefix: string;
	#spinnerTimer: ReturnType<typeof setInterval> | null = null;
	#spinnerFrame = 0;
	#spinnerText = '';
	#titlePrinted = false;
	#passed = 0;
	#failed = 0;
	#warnings = 0;

	constructor(
		groupTitle: string,
		taskCount: number,
		showSummary: boolean = true,
		suppressErrorDetails: boolean = false,
	)
	{
		this.#startTime = Date.now();
		this.#groupTitle = groupTitle;
		this.#isGroup = taskCount > 1;
		this.#showSummary = showSummary;
		this.#suppressErrorDetails = suppressErrorDetails;

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
		if (!message)
		{
			this.#stopSpinner();
			return;
		}

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
		else if (result.status === 'warning')
		{
			this.#warnings++;
		}

		console.log(`${this.#taskPrefix}${statusIcon(result.status)} ${result.title}`);

		if (result.details)
		{
			const filteredDetails = this.#suppressErrorDetails
				? result.details.filter((d) => d.type !== 'error')
				: result.details;

			if (filteredDetails.length > 0)
			{
				this.#renderDetails(filteredDetails, result.status);
			}
		}
	}

	finish(): TaskGroupResult
	{
		this.#stopSpinner();
		this.#printTitle();

		const duration = Date.now() - this.#startTime;
		const total = this.#passed + this.#failed + this.#warnings;

		if (total > 1 && this.#showSummary)
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

	#renderDetails(details: TaskDetail[], status: TaskResult['status']): void
	{
		const items = details.filter((d): d is Extract<TaskDetail, { type: 'item' }> => d.type === 'item');
		const blocks = details.filter((d): d is Extract<TaskDetail, { type: 'block' }> => d.type === 'block');
		const allErrors = details.filter((d): d is TaskError => d.type === 'error');
		const errors = allErrors.filter((d) => !isInternalError(d));
		const internal = allErrors.filter((d) => isInternalError(d));

		const groupSeverity = status === 'warning' ? 'warning' : 'error';

		// Items (bundle sizes, etc.) — always first, compact
		for (const item of items)
		{
			console.log(renderItem(item, this.#detailPrefix));
		}

		// Blocks
		for (const block of blocks)
		{
			console.log(renderBlock(block, this.#detailPrefix));
		}

		// Split errors by per-detail severity when available, fallback to group severity
		const errorDetails = errors.filter((d) => (d.severity ?? groupSeverity) === 'error');
		const warningDetails = errors.filter((d) => (d.severity ?? groupSeverity) === 'warning');
		const hasItemsBefore = items.length > 0 || blocks.length > 0;

		if (errorDetails.length > 0 && warningDetails.length > 0)
		{
			// Mixed: render errors and warnings as separate sections
			this.#renderErrors(errorDetails, 'error', hasItemsBefore);
			this.#renderErrors(warningDetails, 'warning', true);
		}
		else if (errors.length > 0)
		{
			// All same severity
			this.#renderErrors(errors, groupSeverity, hasItemsBefore);
		}

		// Internal errors
		for (const error of internal)
		{
			console.log('');
			console.log(formatInternalError(error));
		}

		// Trailing blank line after errors to separate from next task
		if (errors.length > 0 || internal.length > 0)
		{
			console.log('');
		}
	}

	#renderErrors(errors: TaskError[], severity: 'error' | 'warning', hasItemsBefore: boolean): void
	{
		const colorFn = severity === 'warning' ? chalk.yellow : chalk.red;
		const baseline = errors.filter((d) => isBaselineCode(d.code));
		const regular = errors.filter((d) => !isBaselineCode(d.code));

		if (errors.length === 1 && !hasItemsBefore && baseline.length === 0)
		{
			// Single regular error — inline, no section header
			const error = errors[0];
			console.log(formatError({ ...error, severity }, this.#detailPrefix).join('\n'));

			return;
		}

		const sectionTitle = severity === 'warning'
			? chalk.yellow.bold(`Warnings (${errors.length})`)
			: chalk.red.bold(`Errors (${errors.length})`);

		console.log('');
		console.log(`${this.#detailPrefix}${sectionTitle}`);

		// Regular errors — compact format
		const withFrame = regular.filter((d) => hasCodeFrame(d));
		const withoutFrame = regular.filter((d) => !hasCodeFrame(d));

		// Frameless errors — compact list (first)
		if (withoutFrame.length > 0)
		{
			console.log('');
			for (const error of withoutFrame)
			{
				const codePrefix = error.code ? colorFn(`[${error.code}]`) + ' ' : '';
				console.log(`${this.#detailPrefix}${codePrefix}${error.message}`);
			}
		}

		// Framed regular errors — with separators
		for (let i = 0; i < withFrame.length; i++)
		{
			const error = withFrame[i];

			if (i > 0 || withoutFrame.length > 0)
			{
				console.log('');
				console.log(`${this.#detailPrefix}${chalk.dim('─'.repeat(40))}`);
			}

			console.log('');
			const codePrefix = error.code ? colorFn(`[${error.code}]`) + ' ' : '';
			const shortMessage = error.message.replace(/^.*?\(\d+:\d+\):\s*/, '');
			console.log(`${this.#detailPrefix}${codePrefix}${shortMessage}`);

			const errorLines = formatError({ ...error, severity, message: '' }, this.#detailPrefix);
			if (errorLines.length > 0)
			{
				console.log('');
				console.log(errorLines.join('\n'));
			}
		}

		// Baseline errors — structured blocks (last)
		for (let i = 0; i < baseline.length; i++)
		{
			const error = baseline[i];
			const label = extractFeatureLabel(error.message);
			const browsersStr = extractBrowsersStr(error.message);
			const featureName = extractFeatureName(error.message);

			if (i > 0 || regular.length > 0)
			{
				console.log('');
				console.log(`${this.#detailPrefix}${chalk.dim('─'.repeat(40))}`);
			}

			console.log('');
			console.log(`${this.#detailPrefix}${formatCodeLabel(error.code!, severity)} ${chalk.bold(label)}`);
			console.log('');

			if (error.risk)
			{
				console.log(`${this.#detailPrefix}${formatRiskLine(error.risk)}`);
			}

			if (browsersStr)
			{
				for (const line of formatBrowserLines(browsersStr, this.#detailPrefix))
				{
					console.log(line);
				}
			}

			if (featureName)
			{
				console.log(`${this.#detailPrefix}${formatCaniuseLink(featureName)}`);
			}

			// Code frame
			const errorLines = formatError({ ...error, severity, message: '', code: undefined }, this.#detailPrefix);
			if (errorLines.length > 0)
			{
				console.log('');
				console.log(errorLines.join('\n'));
			}
		}
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
