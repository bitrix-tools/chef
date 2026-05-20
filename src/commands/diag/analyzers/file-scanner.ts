import { readFile } from 'node:fs/promises';

import fg from 'fast-glob';

import { createSpinner } from '../progress-spinner';

export const JS_PATTERNS = ['**/*.js', '**/*.ts'];
export const PHP_PATTERNS = ['**/*.php'];

export const JS_IGNORE = [
	'**/node_modules/**',
	'**/dist/**',
	'**/*.bundle.js',
	'**/*.bundle.css',
	'**/*.min.js',
	'**/bundle.config.js',
	'**/bundle.config.ts',
];

export const PHP_IGNORE = [
	'**/vendor/**',
	'**/node_modules/**',
	'**/lang/**',
	'**/db/**',
	'**/images/**',
	'**/test/**',
	'**/tests/**',
	'**/meta/**',
	'**/updates/**',
	'**/routes/**',
];

type ScanResult = {
	jsCount: number;
	phpCount: number;
};

export async function scanJsFiles(
	startDirectory: string,
	onFile: (file: string, content: string) => void,
): Promise<number>
{
	const spinner = createSpinner('Searching JS/TS files...');

	let jsCount = 0;

	await scanFiles(
		JS_PATTERNS,
		JS_IGNORE,
		startDirectory,
		(file, content) => {
			jsCount++;
			spinner.update(`JS/TS: ${jsCount} files`);
			onFile(file, content);
		},
	);

	spinner.stop();

	return jsCount;
}

export async function scanPhpFiles(
	startDirectory: string,
	onFile: (file: string, content: string) => void,
): Promise<number>
{
	const spinner = createSpinner('Searching PHP files...');

	let phpCount = 0;

	await scanFiles(
		PHP_PATTERNS,
		PHP_IGNORE,
		startDirectory,
		(file, content) => {
			phpCount++;
			spinner.update(`PHP: ${phpCount} files`);
			onFile(file, content);
		},
	);

	spinner.stop();

	return phpCount;
}

export async function scanJsAndPhpFiles(
	startDirectory: string,
	onJsFile: (file: string, content: string) => void,
	onPhpFile: (file: string, content: string) => void,
): Promise<ScanResult>
{
	const jsCount = await scanJsFiles(startDirectory, onJsFile);
	const phpCount = await scanPhpFiles(startDirectory, onPhpFile);

	return { jsCount, phpCount };
}

async function scanFiles(
	patterns: string[],
	ignore: string[],
	cwd: string,
	onFile: (file: string, content: string) => void,
): Promise<void>
{
	const stream = fg.stream(patterns, {
		cwd,
		ignore,
		onlyFiles: true,
		absolute: true,
		dot: true,
	});

	for await (const entry of stream)
	{
		const file = entry.toString();
		let content: string;
		try
		{
			content = await readFile(file, 'utf-8');
		}
		catch
		{
			continue;
		}

		onFile(file, content);
	}
}

/**
 * Strips single-line (//, #) and block comments from a line,
 * tracking multi-line block comment state across calls.
 */
export function stripLineComments(
	line: string,
	inBlockComment: boolean,
): { code: string; stillInComment: boolean }
{
	let result = '';
	let i = 0;
	let inBlock = inBlockComment;

	while (i < line.length)
	{
		if (inBlock)
		{
			const closeIndex = line.indexOf('*/', i);
			if (closeIndex === -1)
			{
				return { code: result, stillInComment: true };
			}

			i = closeIndex + 2;
			inBlock = false;
			continue;
		}

		// Block comment start
		if (line[i] === '/' && line[i + 1] === '*')
		{
			inBlock = true;
			i += 2;
			continue;
		}

		// Single-line comment
		if (line[i] === '/' && line[i + 1] === '/')
		{
			return { code: result, stillInComment: false };
		}

		// PHP # comment (only at start of meaningful content or after whitespace)
		if (line[i] === '#' && (result.trim() === '' || line[i - 1] === ' ' || line[i - 1] === '\t'))
		{
			return { code: result, stillInComment: false };
		}

		// Skip string contents to avoid false positives on comment chars inside strings
		if (line[i] === '"' || line[i] === "'" || line[i] === '`')
		{
			const quote = line[i];
			result += line[i];
			i++;
			while (i < line.length && line[i] !== quote)
			{
				if (line[i] === '\\')
				{
					result += line[i];
					i++;
				}

				if (i < line.length)
				{
					result += line[i];
					i++;
				}
			}

			if (i < line.length)
			{
				result += line[i];
				i++;
			}

			continue;
		}

		result += line[i];
		i++;
	}

	return { code: result, stillInComment: inBlock };
}

/**
 * Strips all comments from content using the line-by-line comment stripper.
 * Returns clean code without comments.
 */
export function stripComments(content: string): string
{
	const lines = content.split('\n');
	const result: string[] = [];
	let inBlockComment = false;

	for (const line of lines)
	{
		const { code, stillInComment } = stripLineComments(line, inBlockComment);
		inBlockComment = stillInComment;
		result.push(code);
	}

	return result.join('\n');
}

export function escapeRegex(str: string): string
{
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
