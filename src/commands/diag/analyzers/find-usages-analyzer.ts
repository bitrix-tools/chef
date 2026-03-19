import * as path from 'node:path';
import { readFile } from 'node:fs/promises';

import fg from 'fast-glob';

import { createSpinner } from '../progress-spinner';

import type { BasePackage } from '../../../modules/packages/base-package';

export type UsageLocation = {
	file: string;
	line: number;
	content: string;
	type: 'js-import' | 'js-load-extension' | 'js-namespace' | 'php-extension-load' | 'php-cjscore' | 'config-rel';
};

const TYPE_LABELS: Record<UsageLocation['type'], string> = {
	'js-import': 'ESM import',
	'js-load-extension': 'BX.loadExtension',
	'js-namespace': 'Namespace access',
	'php-extension-load': 'Extension::load',
	'php-cjscore': 'CJSCore::Init',
	'config-rel': 'config.php rel',
};

const JS_IGNORE = [
	'**/node_modules/**',
	'**/dist/**',
	'**/*.bundle.js',
	'**/*.bundle.css',
	'**/*.min.js',
	'**/bundle.config.js',
	'**/bundle.config.ts',
];

const PHP_IGNORE = [
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

export function getTypeLabel(type: UsageLocation['type']): string
{
	return TYPE_LABELS[type];
}

export async function findUsages(
	extensionName: string,
	extension: BasePackage | null,
	startDirectory: string,
): Promise<UsageLocation[]>
{
	const usages: UsageLocation[] = [];
	const namespace = extension?.getBundleConfig().get('namespace') ?? '';
	let filesScanned = 0;

	const spinner = createSpinner('Searching JS/TS files...');

	let jsCount = 0;
	let phpCount = 0;

	await scanFiles(
		['**/*.js', '**/*.ts'],
		JS_IGNORE,
		startDirectory,
		(file, content) => {
			jsCount++;
			spinner.update(`JS/TS: ${jsCount} files`);
			findJsUsages(content, file, extensionName, namespace, usages);
		},
	);

	spinner.update(`JS/TS: ${jsCount} files, searching PHP...`);

	await scanFiles(
		['**/*.php'],
		PHP_IGNORE,
		startDirectory,
		(file, content) => {
			phpCount++;
			spinner.update(`JS/TS: ${jsCount} files, PHP: ${phpCount} files`);
			findPhpUsages(content, file, extensionName, namespace, usages);
		},
	);

	spinner.stop();

	return usages;
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

function findJsUsages(
	content: string,
	file: string,
	extensionName: string,
	namespace: string,
	usages: UsageLocation[],
): void
{
	const hasName = content.includes(extensionName);
	const hasNamespace = namespace && content.includes(namespace);

	if (!hasName && !hasNamespace)
	{
		return;
	}

	const lines = content.split('\n');
	let inBlockComment = false;

	for (let i = 0; i < lines.length; i++)
	{
		const line = lines[i];
		const lineNumber = i + 1;

		const { code, stillInComment } = stripLineComments(line, inBlockComment);
		inBlockComment = stillInComment;

		if (!code.trim())
		{
			continue;
		}

		if (hasName && (code.includes(`'${extensionName}'`) || code.includes(`"${extensionName}"`)))
		{
			// import ... from 'extension.name'
			const importPattern = new RegExp(`from\\s+['"]${escapeRegex(extensionName)}['"]`);
			if (importPattern.test(code))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: 'js-import' });
				continue;
			}

			// BX.loadExtension / BX.loadExt / Runtime.loadExtension (string or array argument)
			const loadPattern = /(?:BX\.loadExt(?:ension)?|Runtime\.loadExtension)\s*\(/;
			if (loadPattern.test(code))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: 'js-load-extension' });
				continue;
			}
		}

		// BX.Namespace.Something access
		if (hasNamespace && code.includes(namespace))
		{
			const nsPattern = new RegExp(`\\b${escapeRegex(namespace)}\\b`);
			if (nsPattern.test(code))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: 'js-namespace' });
			}
		}
	}
}

function findPhpUsages(
	content: string,
	file: string,
	extensionName: string,
	namespace: string,
	usages: UsageLocation[],
): void
{
	const hasName = content.includes(extensionName);
	const hasNamespace = namespace && content.includes(namespace);

	if (!hasName && !hasNamespace)
	{
		return;
	}

	const lines = content.split('\n');
	let inBlockComment = false;

	for (let i = 0; i < lines.length; i++)
	{
		const line = lines[i];
		const lineNumber = i + 1;

		const { code, stillInComment } = stripLineComments(line, inBlockComment);
		inBlockComment = stillInComment;

		if (!code.trim())
		{
			continue;
		}

		if (hasName && code.includes(extensionName))
		{
			// Extension::load('ext.name') or Extension::load(['ext.name', ...])
			if (/Extension::load\s*\(/.test(code))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: 'php-extension-load' });
				continue;
			}

			// CJSCore::Init(['ext.name']) or CJSCore::Init('ext.name')
			if (/CJSCore::Init\s*\(/.test(code))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: 'php-cjscore' });
				continue;
			}

			// config.php rel array
			if (file.endsWith('config.php'))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: 'config-rel' });
				continue;
			}
		}

		// Namespace usage in inline JS within PHP (e.g. BX.UI.Button in <script> tags)
		if (hasNamespace && code.includes(namespace))
		{
			const nsPattern = new RegExp(`\\b${escapeRegex(namespace)}\\b`);
			if (nsPattern.test(code))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: 'js-namespace' });
			}
		}
	}
}

/**
 * Strips single-line (//, #) and block comments from a line,
 * tracking multi-line block comment state across calls.
 */
function stripLineComments(
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

function escapeRegex(str: string): string
{
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function groupByType(usages: UsageLocation[]): Map<UsageLocation['type'], UsageLocation[]>
{
	const groups = new Map<UsageLocation['type'], UsageLocation[]>();

	for (const usage of usages)
	{
		const list = groups.get(usage.type) ?? [];
		list.push(usage);
		groups.set(usage.type, list);
	}

	return groups;
}

export function relativePath(file: string, startDirectory: string): string
{
	return path.relative(startDirectory, file);
}
