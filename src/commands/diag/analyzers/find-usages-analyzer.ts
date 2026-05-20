import * as path from 'node:path';

import { parseJsFile, nodePosition, traverseShallow } from '../../../utils/ast/parse-babel';

import { scanJsFiles, scanPhpFiles, stripLineComments, escapeRegex } from './file-scanner';

import type { BasePackage } from '../../../modules/packages/base-package';

export type UsageType =
	| 'js-import'
	| 'js-import-dynamic'
	| 'js-load-extension'
	| 'js-namespace'
	| 'js-inheritance'
	| 'php-extension-load'
	| 'php-cjscore'
	| 'config-rel';

/**
 * Extra info attached to a usage. Different types carry different fields:
 * - js-import: names of bindings (e.g. ['UI', 'Manager']); empty for side-effect import.
 * - js-namespace: full chain accessed (e.g. 'BX.UI.Notification.Center').
 * - js-inheritance: name of the superclass (local identifier or full chain).
 */
export type UsageDetails = {
	imports?: string[];
	namespace?: string;
	inheritedFrom?: string;
};

export type UsageLocation = {
	file: string;
	line: number;
	content: string;
	type: UsageType;
	details?: UsageDetails;
};

const TYPE_LABELS: Record<UsageType, string> = {
	'js-import': 'ESM import',
	'js-import-dynamic': 'Dynamic import',
	'js-load-extension': 'Runtime.loadExtension',
	'js-namespace': 'Namespace access',
	'js-inheritance': 'Inheritance (extends)',
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

	// Self-references inside the extension's own source tree are not "usages"
	// in the sense the user cares about — they're the extension defining itself,
	// not someone else using it. Skip them.
	const ownDir = normalizeDir(extension?.getPath());
	const isOwnFile = (file: string): boolean => {
		if (!ownDir)
		{
			return false;
		}

		const normalized = file.replaceAll('\\', '/');

		return normalized === ownDir || normalized.startsWith(`${ownDir}/`);
	};

	const selfNamespace = extension?.getBundleConfig().get('namespace') as string | undefined;

	await scanJsFiles(startDirectory, (file, content) => {
		if (isOwnFile(file))
		{
			return;
		}

		findJsUsages(content, file, extensionName, globals, usages, { selfNamespace });
	});

	await scanPhpFiles(startDirectory, (file, content) => {
		if (isOwnFile(file))
		{
			return;
		}

		// PHP loaders (Extension::load / CJSCore / config.php rel) are reported
		// separately by `find-loaders`. Here we only scan inline <script> blocks
		// since they are part of the JS usage picture.
		findJsUsagesInPhp(content, file, extensionName, globals, usages, { selfNamespace });
	});

	return usages;
}

function normalizeDir(p: string | undefined): string | null
{
	if (!p)
	{
		return null;
	}

	let normalized = p.replaceAll('\\', '/');
	if (normalized.endsWith('/'))
	{
		normalized = normalized.slice(0, -1);
	}

	return normalized;
}

export async function findLoaders(
	extensionName: string,
	startDirectory: string,
): Promise<UsageLocation[]>
{
	const usages: UsageLocation[] = [];

	await scanPhpFiles(startDirectory, (file, content) => {
		findPhpLoaders(content, file, extensionName, usages);
	});

	return usages;
}

const LOAD_EXTENSION_CALLEES = new Set(['BX.loadExtension', 'BX.loadExt', 'Runtime.loadExtension']);

// `Reflection.getClass('BX.UI.Foo')` / `Reflection.namespace('BX.UI.Foo')` —
// dynamic namespace lookup via main.core's Reflection helper. The string
// argument is a full namespace chain, so we treat it the same as a
// MemberExpression access of that chain.
const REFLECTION_LOOKUP_CALLEES = new Set([
	'Reflection.getClass',
	'Reflection.namespace',
	'Runtime.getClass',
	'main_core.Reflection.getClass',
	'main_core.Reflection.namespace',
]);

export type FindJsUsagesOptions = {
	/** Add this number to every reported line (for embedded <script> in PHP). */
	lineOffset?: number;
	/** Lines used to fill `loc.content`. Defaults to the parsed `content`. */
	displayLines?: string[];
	/**
	 * The extension's own bundle namespace (e.g. `BX.UI.Notification`).
	 * Used to match direct references to the namespace object itself via
	 * `Reflection.getClass('BX.UI.Notification')`. Not added to `globals`
	 * because Bitrix extensions often share a root namespace (`BX.UI`), and
	 * a global match would conflate unrelated extensions.
	 */
	selfNamespace?: string;
};

export function findJsUsages(
	content: string,
	file: string,
	extensionName: string,
	globals: Set<string>,
	usages: UsageLocation[],
	options: FindJsUsagesOptions = {},
): void
{
	const selfNamespace = options.selfNamespace;

	// Quick reject: if neither the name nor any global nor the self-namespace
	// appears as a substring, the file can't possibly contain a usage.
	if (!content.includes(extensionName)
		&& ![...globals].some((g) => content.includes(g))
		&& (!selfNamespace || !content.includes(selfNamespace)))
	{
		return;
	}

	const ast = parseJsFile(content, file);
	if (!ast)
	{
		return;
	}

	const lines = options.displayLines ?? content.split('\n');
	const lineOffset = options.lineOffset ?? 0;
	const emit = (node: any, type: UsageType, details?: UsageDetails): void => {
		const { line: parsedLine } = nodePosition(node);
		const line = parsedLine + lineOffset;
		usages.push({
			file,
			line,
			content: (lines[line - 1] ?? '').trim(),
			type,
			...(details && Object.keys(details).length > 0 ? { details } : {}),
		});
	};

	// Local identifiers imported from this extension. Used to detect inheritance
	// from named imports: `import { Balloon } from 'ui.notification'; class X extends Balloon {}`.
	const importedLocals = new Set<string>();

	traverseShallow(ast, {
		ImportDeclaration(path: any)
		{
			if (path.node.source?.value !== extensionName)
			{
				return;
			}

			const names = collectImportNames(path.node.specifiers);
			for (const spec of path.node.specifiers)
			{
				if (spec.local?.name)
				{
					importedLocals.add(spec.local.name);
				}
			}

			emit(path.node, 'js-import', { imports: names });
		},
		ExportNamedDeclaration(path: any)
		{
			if (path.node.source?.value === extensionName)
			{
				const names = collectExportNames(path.node.specifiers);
				emit(path.node, 'js-import', { imports: names });
			}
		},
		ExportAllDeclaration(path: any)
		{
			if (path.node.source?.value === extensionName)
			{
				emit(path.node, 'js-import', { imports: ['*'] });
			}
		},

		CallExpression(path: any)
		{
			const callee = path.node.callee;
			const args = path.node.arguments;

			// Dynamic import: import('ext')
			if (callee.type === 'Import')
			{
				if (args[0]?.type === 'StringLiteral' && args[0].value === extensionName)
				{
					emit(args[0], 'js-import-dynamic');
				}

				return;
			}

			const calleeName = memberExpressionName(callee);

			// BX.loadExtension / BX.loadExt / Runtime.loadExtension
			if (calleeName && LOAD_EXTENSION_CALLEES.has(calleeName))
			{
				for (const arg of args)
				{
					emitLoadExtensionStrings(arg, extensionName, emit);
				}

				return;
			}

			// Reflection.getClass('BX.UI.Foo') / Reflection.namespace('BX.UI.Foo')
			if (calleeName && REFLECTION_LOOKUP_CALLEES.has(calleeName))
			{
				const arg = args[0];
				if (arg?.type === 'StringLiteral' && typeof arg.value === 'string')
				{
					const normalized = stripRootPrefix(arg.value);
					// Direct reference to the extension's own namespace object —
					// e.g. `Reflection.getClass('BX.UI.Notification')`. Only
					// counted when the namespace is specific enough to be owned
					// by this extension. Shared roots like `BX.UI` and `BX`
					// (1-2 segments) are also referenced by other extensions
					// that hang their own classes off the same root, so
					// matching the bare namespace there gives false positives.
					if (selfNamespace && isOwnedNamespace(selfNamespace) && normalized === selfNamespace)
					{
						emit(arg, 'js-namespace', { namespace: selfNamespace });
					}
					else
					{
						const matched = longestGlobalPrefix(arg.value, globals);
						if (matched)
						{
							emit(arg, 'js-namespace', { namespace: matched });
						}
					}
				}

				return;
			}
		},

		// Namespace access: BX.UI.Button[.X.Y.Z]. Match the LONGEST global prefix
		// in the member chain so that `BX.UI.Notification.Center.notify(...)` reports
		// namespace='BX.UI.Notification.Center' (the actual namespace object), not
		// the parent. Only inspect the outermost chain to avoid double-reporting.
		MemberExpression(path: any)
		{
			// Skip nested chain segments — the outermost MemberExpression already
			// covers them.
			if (path.parent?.type === 'MemberExpression')
			{
				return;
			}

			// Skip the `extends X.Y.Z` superclass position — the Class visitor
			// reports it as `js-inheritance`, so emitting `js-namespace` here
			// would double-count the same source location.
			const parent = path.parent;
			if ((parent?.type === 'ClassDeclaration' || parent?.type === 'ClassExpression')
				&& parent.superClass === path.node)
			{
				return;
			}

			const chain = memberExpressionName(path.node);
			if (!chain)
			{
				return;
			}

			const matchedGlobal = longestGlobalPrefix(chain, globals);
			if (matchedGlobal)
			{
				emit(path.node, 'js-namespace', { namespace: matchedGlobal });
			}
		},

		// class X extends Y / class X extends Y.Z {...}
		// Reported if Y is a name we imported from this extension, OR
		// Y.Z[...] starts with one of the exported globals.
		Class(path: any)
		{
			const superClass = path.node.superClass;
			if (!superClass)
			{
				return;
			}

			if (superClass.type === 'Identifier' && importedLocals.has(superClass.name))
			{
				emit(path.node, 'js-inheritance', { inheritedFrom: superClass.name });

				return;
			}

			if (superClass.type === 'MemberExpression')
			{
				const chain = memberExpressionName(superClass);
				if (chain && longestGlobalPrefix(chain, globals))
				{
					emit(path.node, 'js-inheritance', { inheritedFrom: stripRootPrefix(chain) });
				}
			}
		},
	});
}

function collectImportNames(specifiers: any[]): string[]
{
	const names: string[] = [];

	for (const spec of specifiers)
	{
		if (spec.type === 'ImportDefaultSpecifier')
		{
			names.push('default');
		}
		else if (spec.type === 'ImportNamespaceSpecifier')
		{
			names.push('*');
		}
		else if (spec.type === 'ImportSpecifier')
		{
			// `import { foo as bar }` → reported as 'foo' (the source-side name).
			const imported = spec.imported;
			if (imported?.type === 'Identifier')
			{
				names.push(imported.name);
			}
			else if (imported?.type === 'StringLiteral')
			{
				names.push(imported.value);
			}
			else if (spec.local?.name)
			{
				names.push(spec.local.name);
			}
		}
	}

	return names;
}

function collectExportNames(specifiers: any[]): string[]
{
	const names: string[] = [];

	for (const spec of specifiers)
	{
		if (spec.type === 'ExportSpecifier')
		{
			const local = spec.local;
			if (local?.type === 'Identifier')
			{
				names.push(local.name);
			}
		}
	}

	return names;
}

// Cross-frame access patterns commonly used in Bitrix popups/wizards:
// `top.BX.UI.…`, `window.top.BX.UI.…`. Treat them as equivalent to the bare
// chain — same runtime object, just reached through a different window.
const ROOT_PREFIXES = [
	'window.top.',
	'globalThis.top.',
	'self.top.',
	'window.parent.',
	'globalThis.parent.',
	'self.parent.',
	'window.',
	'globalThis.',
	'self.',
	'this.',
	'top.',
	'parent.',
];

/**
 * A namespace is "owned" by a single extension only when it has enough segments
 * to be specific. Short roots are shared by many extensions: `BX` is everyone,
 * `BX.UI` is shared across ui.buttons, ui.notification, ui.entity-editor, etc.
 * Anything ≥3 segments (`BX.UI.Notification`) is treated as owned.
 */
function isOwnedNamespace(namespace: string): boolean
{
	return namespace.split('.').length >= 3;
}

function stripRootPrefix(chain: string): string
{
	for (const prefix of ROOT_PREFIXES)
	{
		if (chain.startsWith(prefix))
		{
			return chain.slice(prefix.length);
		}
	}

	return chain;
}

function longestGlobalPrefix(chain: string, globals: Set<string>): string | null
{
	const normalized = stripRootPrefix(chain);
	const parts = normalized.split('.');
	for (let len = parts.length; len > 0; len--)
	{
		const prefix = parts.slice(0, len).join('.');
		if (globals.has(prefix))
		{
			return prefix;
		}
	}

	return null;
}

function memberExpressionName(node: any): string | null
{
	if (!node)
	{
		return null;
	}

	if (node.type === 'Identifier')
	{
		return node.name;
	}

	if (node.type === 'MemberExpression' && !node.computed && node.property?.type === 'Identifier')
	{
		const objectName = memberExpressionName(node.object);
		if (objectName === null)
		{
			return null;
		}

		return `${objectName}.${node.property.name}`;
	}

	return null;
}

function emitLoadExtensionStrings(
	arg: any,
	extensionName: string,
	emit: (node: any, type: UsageType, details?: UsageDetails) => void,
): void
{
	if (!arg)
	{
		return;
	}

	if (arg.type === 'StringLiteral' && arg.value === extensionName)
	{
		emit(arg, 'js-load-extension');

		return;
	}

	if (arg.type === 'ArrayExpression')
	{
		for (const el of arg.elements)
		{
			if (el?.type === 'StringLiteral' && el.value === extensionName)
			{
				emit(el, 'js-load-extension');
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
	findPhpLoaders(content, file, extensionName, usages);
	findJsUsagesInPhp(content, file, extensionName, globals, usages);
}

/**
 * Scan PHP file for extension loaders: Extension::load, CJSCore::Init, config.php rel.
 * Uses line-by-line regex with paren tracking for multiline calls.
 */
export function findPhpLoaders(
	content: string,
	file: string,
	extensionName: string,
	usages: UsageLocation[],
): void
{
	if (!content.includes(extensionName))
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
			if (code.includes(`'${extensionName}'`) || code.includes(`"${extensionName}"`))
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
			if (code.includes(`'${extensionName}'`) || code.includes(`"${extensionName}"`))
			{
				usages.push({ file, line: lineNumber, content: line.trim(), type: 'php-extension-load' });
			}

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
			if (code.includes(`'${extensionName}'`) || code.includes(`"${extensionName}"`))
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

		// config.php rel array — any mention of the extension name on a non-comment
		// line of config.php is treated as a rel entry. Cheap heuristic; config.php
		// rarely contains the name in any other position.
		if (code.includes(extensionName) && file.endsWith('config.php'))
		{
			usages.push({ file, line: lineNumber, content: line.trim(), type: 'config-rel' });
		}
	}
}

const SCRIPT_BLOCK_REGEX = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
const PHP_TAG_REGEX = /<\?(?:php\b|=)?[\s\S]*?\?>/g;

/**
 * Scan inline `<script>` blocks inside a PHP file and report JS usages via AST.
 * Falls back to per-line regex for namespace matches when the block can't be parsed
 * (e.g. interpolated `<?= ... ?>` that breaks the JS grammar even after stripping).
 */
export function findJsUsagesInPhp(
	content: string,
	file: string,
	extensionName: string,
	globals: Set<string>,
	usages: UsageLocation[],
	options: { selfNamespace?: string } = {},
): void
{
	const allGlobals = [...globals];
	if (!content.includes(extensionName)
		&& !allGlobals.some((g) => content.includes(g))
		&& (!options.selfNamespace || !content.includes(options.selfNamespace)))
	{
		return;
	}

	const phpLines = content.split('\n');

	for (const match of content.matchAll(SCRIPT_BLOCK_REGEX))
	{
		const block = match[1];
		const tagStart = match.index ?? 0;
		// Line where the <script> opening tag is — block content starts on this line
		// (or the next, depending on whether the tag is followed by a newline). For
		// AST purposes, line 1 of the block corresponds to scriptStartLine in PHP.
		const scriptStartLine = lineNumberAt(content, tagStart + match[0].indexOf(block));

		const sanitized = sanitizePhpTags(block);

		// Try AST first.
		const parsedOk = tryAstScan(sanitized, file, extensionName, globals, usages, scriptStartLine, phpLines, options.selfNamespace);

		if (!parsedOk)
		{
			// Regex fallback — namespace access only.
			scanNamespacesRegex(block, file, allGlobals, usages, scriptStartLine, phpLines);
		}
	}
}

function tryAstScan(
	jsCode: string,
	file: string,
	extensionName: string,
	globals: Set<string>,
	usages: UsageLocation[],
	scriptStartLine: number,
	displayLines: string[],
	selfNamespace?: string,
): boolean
{
	const ast = parseJsFile(jsCode, `${file}.inline.js`);
	if (!ast)
	{
		return false;
	}

	// lineOffset = scriptStartLine - 1 so that block line 1 → PHP line scriptStartLine.
	findJsUsages(jsCode, file, extensionName, globals, usages, {
		lineOffset: scriptStartLine - 1,
		displayLines,
		selfNamespace,
	});

	return true;
}

function scanNamespacesRegex(
	jsBlock: string,
	file: string,
	globals: string[],
	usages: UsageLocation[],
	scriptStartLine: number,
	displayLines: string[],
): void
{
	const blockLines = jsBlock.split('\n');
	let inBlockComment = false;

	for (let i = 0; i < blockLines.length; i++)
	{
		const { code, stillInComment } = stripLineComments(blockLines[i], inBlockComment);
		inBlockComment = stillInComment;

		if (!code.trim())
		{
			continue;
		}

		for (const global of globals)
		{
			if (code.includes(global) && new RegExp(`\\b${escapeRegex(global)}\\b`).test(code))
			{
				const phpLineNumber = scriptStartLine + i;
				usages.push({
					file,
					line: phpLineNumber,
					content: (displayLines[phpLineNumber - 1] ?? '').trim(),
					type: 'js-namespace',
					details: { namespace: global },
				});
				break;
			}
		}
	}
}

/**
 * Replace each `<?…?>` block with same-length whitespace so JS line/column
 * positions stay stable for the AST parser.
 */
function sanitizePhpTags(block: string): string
{
	return block.replace(PHP_TAG_REGEX, (raw) => {
		// Preserve newlines so line numbers don't shift.
		return raw.replace(/[^\n]/g, ' ');
	});
}

function lineNumberAt(text: string, offset: number): number
{
	let line = 1;
	for (let i = 0; i < offset && i < text.length; i++)
	{
		if (text.charCodeAt(i) === 10)
		{
			line++;
		}
	}

	return line;
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
