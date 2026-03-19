import { readFile } from 'node:fs/promises';

import fg from 'fast-glob';

import { createSpinner } from '../progress-spinner';

import type { PackageSnapshot } from '../package-snapshot';

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

export type OrphanResult = {
	name: string;
};

export async function analyzeOrphans(
	packages: PackageSnapshot[],
	startDirectory: string,
): Promise<OrphanResult[]>
{
	const allNames = new Set(packages.map((p) => p.name));

	// Collect all extension names referenced as dependencies in config.php
	const referencedInConfig = new Set<string>();

	for (const pkg of packages)
	{
		for (const dep of pkg.dependencies)
		{
			referencedInConfig.add(dep);
		}
	}

	// Collect all extension names mentioned in JS/TS/PHP files
	const referencedInCode = await findReferencedExtensions(allNames, startDirectory);

	// Extensions that are never referenced anywhere
	const orphans: OrphanResult[] = [];

	for (const pkg of packages)
	{
		if (referencedInConfig.has(pkg.name))
		{
			continue;
		}

		if (referencedInCode.has(pkg.name))
		{
			continue;
		}

		orphans.push({ name: pkg.name });
	}

	return orphans.sort((a, b) => a.name.localeCompare(b.name));
}

async function findReferencedExtensions(
	allNames: Set<string>,
	startDirectory: string,
): Promise<Set<string>>
{
	const referenced = new Set<string>();

	const spinner = createSpinner('Searching JS/TS files...');

	let jsCount = 0;
	let phpCount = 0;

	const jsStream = fg.stream(['**/*.js', '**/*.ts'], {
		cwd: startDirectory,
		ignore: JS_IGNORE,
		onlyFiles: true,
		absolute: true,
		dot: true,
	});

	for await (const entry of jsStream)
	{
		const file = entry.toString();
		jsCount++;
		spinner.update(`JS/TS: ${jsCount} files`);

		let content: string;
		try
		{
			content = await readFile(file, 'utf-8');
		}
		catch
		{
			continue;
		}

		checkJsNames(stripComments(content), allNames, referenced);
	}

	spinner.update(`JS/TS: ${jsCount} files, searching PHP...`);

	const phpStream = fg.stream(['**/*.php'], {
		cwd: startDirectory,
		ignore: PHP_IGNORE,
		onlyFiles: true,
		absolute: true,
		dot: true,
	});

	for await (const entry of phpStream)
	{
		const file = entry.toString();
		phpCount++;
		spinner.update(`JS/TS: ${jsCount} files, PHP: ${phpCount} files`);

		let content: string;
		try
		{
			content = await readFile(file, 'utf-8');
		}
		catch
		{
			continue;
		}

		checkPhpNames(stripComments(content), file, allNames, referenced);
	}

	spinner.stop();

	return referenced;
}

function stripComments(content: string): string
{
	// Remove block comments /* ... */
	let result = content.replace(/\/\*[\s\S]*?\*\//g, '');
	// Remove single-line comments // ...
	result = result.replace(/\/\/.*$/gm, '');
	// Remove PHP # comments (only when # is the first non-whitespace or after whitespace)
	result = result.replace(/(?<=^|\s)#.*$/gm, '');

	return result;
}

/**
 * Checks JS/TS content for extension usage patterns:
 * - ESM import:                from 'extension.name'
 * - BX.loadExtension:          BX.loadExtension('extension.name')
 * - BX.loadExt:                BX.loadExt('extension.name')
 * - Runtime.loadExtension:     Runtime.loadExtension('extension.name')
 *
 * All patterns require the extension name to appear in quotes.
 */
function checkJsNames(content: string, allNames: Set<string>, referenced: Set<string>): void
{
	for (const name of allNames)
	{
		if (referenced.has(name))
		{
			continue;
		}

		if (content.includes(`'${name}'`) || content.includes(`"${name}"`))
		{
			referenced.add(name);
		}
	}
}

/**
 * Checks PHP content for extension usage patterns:
 * - Extension::load('extension.name') or Extension::load(['extension.name', ...])
 * - CJSCore::Init(['extension.name']) or CJSCore::Init('extension.name')
 * - config.php rel array (extension name in quotes)
 * - Inline JS (extension name in quotes within <script> tags)
 *
 * All patterns require the extension name to appear in quotes.
 */
function checkPhpNames(content: string, file: string, allNames: Set<string>, referenced: Set<string>): void
{
	for (const name of allNames)
	{
		if (referenced.has(name))
		{
			continue;
		}

		if (content.includes(`'${name}'`) || content.includes(`"${name}"`))
		{
			referenced.add(name);
		}
	}
}
