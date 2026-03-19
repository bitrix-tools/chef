import * as path from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';

export type CircularImportChain = string[];

export type CircularImportsResult = {
	name: string;
	cycles: CircularImportChain[];
};

export function findCircularImports(
	sourceFiles: string[],
	extensionPath: string,
): Promise<CircularImportChain[]>
{
	return buildGraphAndFindCycles(sourceFiles, extensionPath);
}

async function buildGraphAndFindCycles(
	sourceFiles: string[],
	extensionPath: string,
): Promise<CircularImportChain[]>
{
	const graph = new Map<string, Set<string>>();
	const fileSet = new Set(sourceFiles);

	for (const file of sourceFiles)
	{
		const imports = await extractLocalImports(file);
		const resolved = new Set<string>();

		for (const importPath of imports)
		{
			const absolute = resolveImportPath(importPath, path.dirname(file));
			if (absolute && fileSet.has(absolute))
			{
				resolved.add(absolute);
			}
		}

		graph.set(file, resolved);
	}

	return detectCycles(graph, extensionPath);
}

async function extractLocalImports(filePath: string): Promise<string[]>
{
	let content: string;
	try
	{
		content = await readFile(filePath, 'utf-8');
	}
	catch
	{
		return [];
	}

	// Strip comments
	content = content.replace(/\/\*[\s\S]*?\*\//g, '');
	content = content.replace(/\/\/.*$/gm, '');

	const imports: string[] = [];

	// import ... from './path' / import './path'
	// export ... from './path'
	const pattern = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"](\.\.?\/[^'"]+)['"]/g;

	for (const match of content.matchAll(pattern))
	{
		imports.push(match[1]);
	}

	return imports;
}

function resolveImportPath(importPath: string, fromDir: string): string | null
{
	const resolved = path.resolve(fromDir, importPath);

	if (existsSync(resolved) && statSync(resolved).isFile())
	{
		return resolved;
	}

	for (const ext of ['.ts', '.js', '.tsx', '.jsx'])
	{
		const withExt = resolved + ext;
		if (existsSync(withExt))
		{
			return withExt;
		}
	}

	for (const ext of ['.ts', '.js'])
	{
		const indexPath = path.join(resolved, `index${ext}`);
		if (existsSync(indexPath))
		{
			return indexPath;
		}
	}

	return null;
}

function detectCycles(
	graph: Map<string, Set<string>>,
	extensionPath: string,
): CircularImportChain[]
{
	const cycles: CircularImportChain[] = [];
	const seen = new Set<string>();

	for (const node of graph.keys())
	{
		if (seen.has(node))
		{
			continue;
		}

		const stack: string[] = [];
		const stackSet = new Set<string>();

		dfs(node, graph, stack, stackSet, seen, cycles);
	}

	// Deduplicate cycles (same cycle can be found from different start nodes)
	const unique = deduplicateCycles(cycles);

	// Convert to relative paths
	return unique.map((cycle) =>
		cycle.map((file) => path.relative(extensionPath, file)),
	);
}

function dfs(
	node: string,
	graph: Map<string, Set<string>>,
	stack: string[],
	stackSet: Set<string>,
	seen: Set<string>,
	cycles: CircularImportChain[],
): void
{
	if (stackSet.has(node))
	{
		// Found a cycle — extract it from the stack
		const cycleStart = stack.indexOf(node);
		const cycle = [...stack.slice(cycleStart), node];
		cycles.push(cycle);

		return;
	}

	if (seen.has(node))
	{
		return;
	}

	stack.push(node);
	stackSet.add(node);

	const neighbors = graph.get(node);
	if (neighbors)
	{
		for (const neighbor of neighbors)
		{
			dfs(neighbor, graph, stack, stackSet, seen, cycles);
		}
	}

	stack.pop();
	stackSet.delete(node);
	seen.add(node);
}

function deduplicateCycles(cycles: CircularImportChain[]): CircularImportChain[]
{
	const seen = new Set<string>();
	const unique: CircularImportChain[] = [];

	for (const cycle of cycles)
	{
		// Normalize: rotate so the smallest element is first
		const elements = cycle.slice(0, -1); // Remove closing element (same as first)
		const minIndex = elements.indexOf(
			elements.reduce((a, b) => (a < b ? a : b)),
		);
		const rotated = [...elements.slice(minIndex), ...elements.slice(0, minIndex), elements[minIndex]];
		const key = rotated.join(' → ');

		if (!seen.has(key))
		{
			seen.add(key);
			unique.push(cycle);
		}
	}

	return unique;
}
