#!/usr/bin/env tsx

/**
 * Sorts imports in TypeScript files according to the convention:
 * 1. Node.js built-in modules (node:*)
 * 2. External packages (npm dependencies)
 * 3. Local imports (./*, ../*)
 * 4. Type-only imports (import type)
 *
 * Groups are separated by a blank line.
 * Order within groups is preserved.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

type ImportLine = {
	text: string;
	group: 'node' | 'external' | 'local' | 'type';
};

function classifyImport(line: string): ImportLine['group']
{
	const trimmed = line.trim();

	// import type { ... } from '...' or import type X from '...'
	if (/^import\s+type\s/.test(trimmed))
	{
		return 'type';
	}

	// Extract the module specifier
	const match = trimmed.match(/from\s+['"]([^'"]+)['"]/);
	if (!match)
	{
		// Side-effect import: import './foo' or import 'foo'
		const sideEffect = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
		if (sideEffect)
		{
			const spec = sideEffect[1];
			if (spec.startsWith('node:'))
			{
				return 'node';
			}

			if (spec.startsWith('.'))
			{
				return 'local';
			}

			return 'external';
		}

		return 'local';
	}

	const spec = match[1];

	if (spec.startsWith('node:'))
	{
		return 'node';
	}

	if (spec.startsWith('.') || spec.startsWith('/'))
	{
		return 'local';
	}

	return 'external';
}

function isImportLine(line: string): boolean
{
	return /^\s*import\s/.test(line);
}

function isMultilineImportStart(line: string): boolean
{
	return isImportLine(line) && line.includes('{') && !line.includes('}');
}

function sortImports(content: string): string
{
	const lines = content.split('\n');
	const result: string[] = [];

	let i = 0;

	// Skip leading comments/blank lines before first import
	while (i < lines.length && !isImportLine(lines[i]))
	{
		result.push(lines[i]);
		i++;
	}

	if (i >= lines.length)
	{
		return content;
	}

	// Collect all import lines (including multiline)
	const imports: ImportLine[] = [];
	while (i < lines.length)
	{
		const line = lines[i];

		if (!isImportLine(line))
		{
			// Could be a blank line between import groups — skip it
			if (line.trim() === '' && i + 1 < lines.length && isImportLine(lines[i + 1]))
			{
				i++;
				continue;
			}

			break;
		}

		// Handle multiline imports
		if (isMultilineImportStart(line))
		{
			let fullImport = line;
			i++;
			while (i < lines.length && !lines[i].includes('}'))
			{
				fullImport += '\n' + lines[i];
				i++;
			}

			if (i < lines.length)
			{
				fullImport += '\n' + lines[i];
			}

			imports.push({ text: fullImport, group: classifyImport(fullImport) });
			i++;
			continue;
		}

		imports.push({ text: line, group: classifyImport(line) });
		i++;
	}

	if (imports.length === 0)
	{
		return content;
	}

	// Group imports preserving order within groups
	const groups: Record<ImportLine['group'], string[]> = {
		node: [],
		external: [],
		local: [],
		type: [],
	};

	for (const imp of imports)
	{
		groups[imp.group].push(imp.text);
	}

	// Build sorted import block
	const sortedGroups: string[][] = [
		groups.node,
		groups.external,
		groups.local,
		groups.type,
	].filter((g) => g.length > 0);

	for (let gi = 0; gi < sortedGroups.length; gi++)
	{
		if (gi > 0)
		{
			result.push('');
		}

		result.push(...sortedGroups[gi]);
	}

	// Add the rest of the file
	// Skip any blank lines right after imports
	while (i < lines.length && lines[i].trim() === '')
	{
		i++;
	}

	if (i < lines.length)
	{
		result.push('');
	}

	while (i < lines.length)
	{
		result.push(lines[i]);
		i++;
	}

	return result.join('\n');
}

// Main
const targetDir = path.resolve(process.argv[2] || 'src');
let changedCount = 0;
let totalCount = 0;

function processDirectory(dir: string): void
{
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries)
	{
		const fullPath = path.join(dir, entry.name);

		if (entry.isDirectory())
		{
			processDirectory(fullPath);
			continue;
		}

		if (!entry.name.endsWith('.ts'))
		{
			continue;
		}

		totalCount++;
		const original = fs.readFileSync(fullPath, 'utf-8');
		const sorted = sortImports(original);

		if (sorted !== original)
		{
			fs.writeFileSync(fullPath, sorted);
			console.log(`  sorted: ${path.relative(process.cwd(), fullPath)}`);
			changedCount++;
		}
	}
}

processDirectory(targetDir);
console.log(`\n${changedCount} files changed out of ${totalCount} total`);
