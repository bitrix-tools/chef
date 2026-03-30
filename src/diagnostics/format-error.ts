import chalk from 'chalk';
import boxen from 'boxen';

import { CF } from './diagnostic-codes';
import {
	stripAnsi,
	hasLocalFilePath,
	hasCodeFramePatterns,
	isCodeFrameLine,
	styleErrorMessage,
	renderCodeFrame,
	formatStack,
} from './code-frame';
import { renderDiff } from './render-diff';
import { getChefVersion } from '../utils/chef-version';

export interface ErrorInfo
{
	code?: string;
	severity?: 'error' | 'warning';
	message: string;
	stack?: string;
	frame?: string;
	loc?: { file: string; line: number; column: number };
	actual?: unknown;
	expected?: unknown;
	showDiff?: boolean;
}

export function formatError(error: ErrorInfo, indent = ''): string[]
{
	const lines: string[] = [];
	const codePrefix = error.code
		? (error.severity === 'warning' ? chalk.yellow(`[${error.code}]`) : chalk.red(`[${error.code}]`)) + ' '
		: '';

	if (error.message)
	{
		const stripped = stripAnsi(error.message);
		const willRenderCodeFrame = error.loc || error.frame || hasLocalFilePath(error.stack);

		if (willRenderCodeFrame)
		{
			// Strip embedded code frame from message — we'll render our own from loc/frame/stack
			const textOnly = stripped.split('\n')
				.filter((line) => !isCodeFrameLine(line))
				.join('\n')
				.trim();

			if (textOnly)
			{
				const continuationIndent = '  ' + ' '.repeat(stripAnsi(codePrefix).length);
				const msgLines = textOnly.split('\n');
				for (let i = 0; i < msgLines.length; i++)
				{
					lines.push(i === 0 ? `  ${codePrefix}${msgLines[i]}` : `${continuationIndent}${msgLines[i]}`);
				}
			}
		}
		else if (hasCodeFramePatterns(stripped))
		{
			const styled = styleErrorMessage(stripped);
			if (codePrefix && styled.length > 0)
			{
				styled[0] = `${codePrefix}${styled[0]}`;
			}
			lines.push(...styled);
		}
		else
		{
			lines.push(`  ${codePrefix}${stripped}`);
		}
	}

	// If loc is provided, render our own code frame (pipe format) instead of Rollup's
	if (error.loc)
	{
		if (lines.length > 0)
		{
			lines.push('');
		}

		lines.push(...renderCodeFrame(error.loc.file, error.loc.line, error.loc.column));
		lines.push('');
		lines.push(`  at ${error.loc.file}:${error.loc.line}:${error.loc.column}`);
	}
	else if (error.frame)
	{
		if (lines.length > 0)
		{
			lines.push('');
		}

		lines.push(...styleErrorMessage(stripAnsi(error.frame)));
	}

	if (error.showDiff && error.actual !== undefined && error.expected !== undefined)
	{
		if (lines.length > 0)
		{
			lines.push('');
		}

		lines.push(...renderDiff(error.actual, error.expected));
	}

	if (error.stack)
	{
		const stackLines = formatStack(error.stack);
		if (stackLines.length > 0)
		{
			if (lines.length > 0)
			{
				lines.push('');
			}

			lines.push(...stackLines);
		}
	}

	if (!indent)
	{
		return lines;
	}

	return lines.map((line) => line === '' ? '' : `${indent}${line}`);
}


function formatFullStack(stack: string): string[]
{
	return stack.split('\n')
		.filter((line) => line.trim().length > 0)
		.slice(1)
		.map((line) => chalk.dim(line.trim()));
}

export function formatInternalError(error: ErrorInfo): string
{
	const lines: string[] = [];

	const code = error.code ?? CF.UNCAUGHT_EXCEPTION;
	lines.push(chalk.red.bold(`${code}: ${error.message}`));

	if (error.stack)
	{
		lines.push('');
		lines.push(chalk.dim('Stack trace:'));
		lines.push(...formatFullStack(error.stack));
	}

	lines.push('');
	lines.push(`${chalk.dim('chef')}     ${getChefVersion()}`);
	lines.push(`${chalk.dim('node')}     ${process.version}`);
	lines.push(`${chalk.dim('platform')} ${process.platform} ${process.arch}`);
	lines.push('');
	lines.push(`If this is unexpected, please report it:`);
	lines.push(chalk.cyan('https://github.com/bitrix-tools/chef/issues'));

	return boxen(lines.join('\n'), {
		padding: 1,
		borderStyle: 'round',
		borderColor: 'red',
		title: chalk.red.bold('Internal Error'),
	});
}
