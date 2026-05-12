import * as fs from 'node:fs';

const STACK_LOCATION_RE = /((?:[A-Za-z]:)?[/\\][^\s:()]+):(\d+):(\d+)/;

export type FrameLocation = {
	file: string,
	line: number,
	column: number,
	frame: string,
};

/**
 * Reads the first local file location from a stack trace and renders a small
 * plain-text code frame around it. ANSI-free — meant for JSON payloads.
 *
 * Returns null when the stack does not point to a readable local file.
 */
export function extractFrameFromStack(stack: string | undefined): FrameLocation | null
{
	if (!stack)
	{
		return null;
	}

	for (const line of stack.split('\n'))
	{
		const match = line.match(STACK_LOCATION_RE);
		if (!match)
		{
			continue;
		}

		const [, file, lineStr, columnStr] = match;
		if (file.startsWith('//') || file.includes('://'))
		{
			continue;
		}

		const lineNum = Number(lineStr);
		const columnNum = Number(columnStr);
		const frame = renderFrame(file, lineNum, columnNum);
		if (frame === null)
		{
			continue;
		}

		return { file, line: lineNum, column: columnNum, frame };
	}

	return null;
}

function renderFrame(file: string, line: number, column: number): string | null
{
	let content: string;
	try
	{
		content = fs.readFileSync(file, 'utf-8');
	}
	catch
	{
		return null;
	}

	const sourceLines = content.split('\n');
	const contextSize = 2;
	const start = Math.max(0, line - contextSize - 1);
	const end = Math.min(sourceLines.length, line + contextSize);
	const padWidth = String(end).length;
	const result: string[] = [];

	for (let i = start; i < end; i++)
	{
		const lineNum = String(i + 1).padStart(padWidth);
		const sourceLine = sourceLines[i].replaceAll('\t', '    ');
		const marker = i + 1 === line ? '>' : ' ';
		result.push(`${marker} ${lineNum} | ${sourceLine}`);

		if (i + 1 === line)
		{
			const rawLine = sourceLines[i];
			let expandedCol = 0;
			for (let c = 0; c < column - 1 && c < rawLine.length; c++)
			{
				expandedCol += rawLine[c] === '\t' ? 4 : 1;
			}
			let pointerPos = expandedCol;
			if (pointerPos <= 0)
			{
				const ws = sourceLine.match(/\S/);
				pointerPos = ws ? ws.index! : 0;
			}
			const pointer = ' '.repeat(pointerPos) + '^';
			result.push(`  ${' '.repeat(padWidth)} | ${pointer}`);
		}
	}

	return result.join('\n');
}
