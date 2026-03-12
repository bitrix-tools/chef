import * as fs from 'node:fs';

import chalk from 'chalk';

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

function hasCodeFramePatterns(text: string): boolean
{
	return /^\s*>\s*\d+\s*\|/m.test(text)
		|| /^\s*\d+\s*\|/m.test(text)
		|| /^\s*\d+:\s/m.test(text);
}

function isCodeFrameLine(line: string): boolean
{
	const trimmed = line.trimStart();

	// "> 5 |", "  5 |", "    | ^"
	if (/^>\s*\d+\s*\|/.test(trimmed) || /^\d+\s*\|/.test(trimmed) || /^\|\s*\^/.test(trimmed))
	{
		return true;
	}

	// "5: code", "   ^"
	if (/^\d+:\s/.test(trimmed) || /^\^+$/.test(trimmed))
	{
		return true;
	}

	// "at /path:line:col"
	if (/^at\s+\//.test(trimmed))
	{
		return true;
	}

	return false;
}

export function styleErrorMessage(message: string): string[]
{
	const lines = message.split('\n');
	const result: string[] = [];

	for (const line of lines)
	{
		const trimmed = line.trimStart();

		// Code frame (pipe format): "> 35 | code" — error line
		if (/^>\s*\d+\s*\|/.test(trimmed))
		{
			const pipeIndex = line.indexOf('|');
			const prefix = line.slice(line.indexOf('>') + 1, pipeIndex);
			result.push(chalk.red('>') + chalk.dim(prefix) + chalk.gray('|') + line.slice(pipeIndex + 1));
			continue;
		}

		// Code frame (pipe format): "  35 | code" — context line
		if (/^\d+\s*\|/.test(trimmed))
		{
			const pipeIndex = line.indexOf('|');
			result.push(chalk.dim(line.slice(0, pipeIndex)) + chalk.gray('|') + line.slice(pipeIndex + 1));
			continue;
		}

		// Code frame (pipe format): "     | ^" — pointer line
		if (/^\s*\|\s*\^/.test(line))
		{
			const pipeIndex = line.indexOf('|');
			result.push(line.slice(0, pipeIndex) + chalk.gray('|') + chalk.red(line.slice(pipeIndex + 1)));
			continue;
		}

		// Code frame (Rollup format): " 5: import { ... }" — context line
		if (/^\s*\d+:\s/.test(line))
		{
			const colonIndex = line.indexOf(':');
			result.push(chalk.dim(line.slice(0, colonIndex)) + chalk.gray(':') + line.slice(colonIndex + 1));
			continue;
		}

		// Code frame (Rollup format): "      ^" — pointer line
		if (/^\s+\^/.test(line))
		{
			result.push(chalk.red(line));
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

export function renderCodeFrame(filePath: string, errorLine: number, errorCol: number): string[]
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

			// Column 1 often means "whole line" — point to first non-whitespace character
			let pointerPos = expandedCol - strip;
			if (pointerPos <= 0)
			{
				const match = sourceLine.match(/\S/);
				pointerPos = match ? match.index! : 0;
			}

			const pointer = ' '.repeat(pointerPos) + '^';
			result.push(`  ${' '.repeat(padWidth)} ${chalk.gray('|')} ${chalk.red(pointer)}`);
		}
		else
		{
			result.push(`  ${chalk.dim(lineNum)} ${chalk.gray('|')} ${sourceLine}`);
		}
	}

	return result;
}

export function formatStack(stack: string): string[]
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

export function renderDiff(actual: unknown, expected: unknown): string[]
{
	// For scalar values: simple Expected / Received
	if (isScalar(actual) && isScalar(expected))
	{
		const expectedStr = stringify(expected);
		const actualStr = stringify(actual);

		return [
			...expectedStr.split('\n').map((line, i) =>
				chalk.green(i === 0 ? `  Expected: ${line}` : `            ${line}`),
			),
			...actualStr.split('\n').map((line, i) =>
				chalk.red(i === 0 ? `  Received: ${line}` : `            ${line}`),
			),
		];
	}

	// For objects/arrays: line-by-line diff
	const actualStr = stringify(actual);
	const expectedStr = stringify(expected);
	const actualLines = actualStr.split('\n');
	const expectedLines = expectedStr.split('\n');
	const maxLen = Math.max(actualLines.length, expectedLines.length);
	const lines: string[] = [];

	lines.push(`  ${chalk.green('- Expected')}  ${chalk.red('+ Received')}`);
	lines.push('');

	for (let i = 0; i < maxLen; i++)
	{
		const aLine = actualLines[i];
		const eLine = expectedLines[i];

		if (aLine === eLine)
		{
			lines.push(`      ${aLine}`);
		}
		else
		{
			if (eLine !== undefined)
			{
				lines.push(`    ${chalk.green('-')} ${chalk.green(eLine)}`);
			}
			if (aLine !== undefined)
			{
				lines.push(`    ${chalk.red('+')} ${chalk.red(aLine)}`);
			}
		}
	}

	return lines;
}

export interface ErrorInfo
{
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
				for (const msgLine of textOnly.split('\n'))
				{
					lines.push(`  ${msgLine}`);
				}
			}
		}
		else if (hasCodeFramePatterns(stripped))
		{
			lines.push(...styleErrorMessage(stripped));
		}
		else
		{
			lines.push(`  ${stripped}`);
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
