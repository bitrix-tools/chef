import * as path from 'node:path';

import { scanJsAndPhpFiles, stripLineComments, escapeRegex } from './file-scanner';

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

export function getTypeLabel(type: UsageLocation['type']): string
{
	return TYPE_LABELS[type];
}

export async function findUsages(
	extensionName: string,
	extension: BasePackage | null,
	globals: Set<string>,
	startDirectory: string,
): Promise<UsageLocation[]>
{
	const usages: UsageLocation[] = [];

	await scanJsAndPhpFiles(
		startDirectory,
		(file, content) => {
			findJsUsages(content, file, extensionName, globals, usages);
		},
		(file, content) => {
			findPhpUsages(content, file, extensionName, globals, usages);
		},
	);

	return usages;
}

export function findJsUsages(
	content: string,
	file: string,
	extensionName: string,
	globals: Set<string>,
	usages: UsageLocation[],
): void
{
	const hasName = content.includes(extensionName);
	const matchingGlobals = [...globals].filter((g) => content.includes(g));

	if (!hasName && matchingGlobals.length === 0)
	{
		return;
	}

	const lines = content.split('\n');
	let inBlockComment = false;
	let pendingLoadExtension = false;
	let parenDepth = 0;

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

		// Track multiline BX.loadExtension(...) / BX.loadExt(...) / Runtime.loadExtension(...)
		if (pendingLoadExtension)
		{
			if (hasName && (code.includes(`'${extensionName}'`) || code.includes(`"${extensionName}"`)))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: 'js-load-extension' });
			}

			for (const char of code)
			{
				if (char === '(') { parenDepth++; }
				if (char === ')') { parenDepth--; }
			}

			if (parenDepth <= 0)
			{
				pendingLoadExtension = false;
				parenDepth = 0;
			}

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

				const depth = countParenDepth(code, loadPattern);
				if (depth > 0)
				{
					pendingLoadExtension = true;
					parenDepth = depth;
				}

				continue;
			}
		}

		// BX.loadExtension / BX.loadExt / Runtime.loadExtension — start of multiline call (name on next line)
		const loadPattern = /(?:BX\.loadExt(?:ension)?|Runtime\.loadExtension)\s*\(/;
		if (hasName && loadPattern.test(code))
		{
			const depth = countParenDepth(code, loadPattern);
			if (depth > 0)
			{
				pendingLoadExtension = true;
				parenDepth = depth;
				continue;
			}
		}

		// BX.Namespace.ExportedName access (e.g. BX.UI.Button, BX.UI.ButtonColor)
		for (const global of matchingGlobals)
		{
			if (code.includes(global))
			{
				const globalPattern = new RegExp(`\\b${escapeRegex(global)}\\b`);
				if (globalPattern.test(code))
				{
					usages.push({ file, line: lineNumber, content: line.trim(), type: 'js-namespace' });
					break;
				}
			}
		}
	}
}

export function findPhpUsages(
	content: string,
	file: string,
	extensionName: string,
	globals: Set<string>,
	usages: UsageLocation[],
): void
{
	const hasName = content.includes(extensionName);
	const matchingGlobals = [...globals].filter((g) => content.includes(g));

	if (!hasName && matchingGlobals.length === 0)
	{
		return;
	}

	const lines = content.split('\n');
	let inBlockComment = false;
	let pendingCall: 'php-extension-load' | 'php-cjscore' | null = null;
	let parenDepth = 0;

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

		// Track multiline Extension::load(...) / CJSCore::Init(...) calls
		if (pendingCall)
		{
			if (hasName && (code.includes(`'${extensionName}'`) || code.includes(`"${extensionName}"`)))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: pendingCall });
			}

			for (const char of code)
			{
				if (char === '(') { parenDepth++; }
				if (char === ')') { parenDepth--; }
			}

			if (parenDepth <= 0)
			{
				pendingCall = null;
				parenDepth = 0;
			}

			continue;
		}

		// Extension::load(...) or \Bitrix\Main\UI\Extension::load(...)
		if (/Extension::load\s*\(/.test(code))
		{
			if (hasName && (code.includes(`'${extensionName}'`) || code.includes(`"${extensionName}"`)))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: 'php-extension-load' });
			}

			// Check if call spans multiple lines (open paren without matching close)
			const depth = countParenDepth(code, /Extension::load\s*\(/);
			if (depth > 0)
			{
				pendingCall = 'php-extension-load';
				parenDepth = depth;
			}

			continue;
		}

		// CJSCore::Init(...) — same multiline handling
		if (/CJSCore::Init\s*\(/.test(code))
		{
			if (hasName && (code.includes(`'${extensionName}'`) || code.includes(`"${extensionName}"`)))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: 'php-cjscore' });
			}

			const depth = countParenDepth(code, /CJSCore::Init\s*\(/);
			if (depth > 0)
			{
				pendingCall = 'php-cjscore';
				parenDepth = depth;
			}

			continue;
		}

		if (hasName && code.includes(extensionName))
		{
			// config.php rel array
			if (file.endsWith('config.php'))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: 'config-rel' });
				continue;
			}
		}

		// Namespace.ExportedName usage in inline JS within PHP (e.g. BX.UI.Button in <script> tags)
		for (const global of matchingGlobals)
		{
			if (code.includes(global))
			{
				const globalPattern = new RegExp(`\\b${escapeRegex(global)}\\b`);
				if (globalPattern.test(code))
				{
					usages.push({ file, line: lineNumber, content: line.trim(), type: 'js-namespace' });
					break;
				}
			}
		}
	}
}

/**
 * Count open-minus-close parentheses starting from the call pattern match.
 * Returns > 0 if the call is not closed on this line.
 */
function countParenDepth(code: string, callPattern: RegExp): number
{
	const match = callPattern.exec(code);
	if (!match)
	{
		return 0;
	}

	let depth = 0;
	for (let i = match.index; i < code.length; i++)
	{
		if (code[i] === '(') { depth++; }
		if (code[i] === ')') { depth--; }
	}

	return depth;
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
