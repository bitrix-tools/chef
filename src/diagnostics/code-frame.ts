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

export function hasCodeFrame(error: { frame?: string; loc?: unknown; stack?: string }): boolean
{
	return !!error.frame || !!error.loc || hasLocalFilePath(error.stack);
}

export function hasCodeFramePatterns(text: string): boolean
{
	return /^\s*>\s*\d+\s*\|/m.test(text)
		|| /^\s*\d+\s*\|/m.test(text)
		|| /^\s*\d+:\s/m.test(text);
}

export function isCodeFrameLine(line: string): boolean
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
			result.push(chalk.dim(line.slice(0, pipeIndex)) + chalk.gray('|') + chalk.dim(line.slice(pipeIndex + 1)));
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
			result.push(chalk.dim(line.slice(0, colonIndex)) + chalk.gray(':') + chalk.dim(line.slice(colonIndex + 1)));
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
			result.push(`  ${chalk.dim(lineNum)} ${chalk.gray('|')} ${chalk.dim(sourceLine)}`);
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
