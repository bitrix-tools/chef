import { statSync } from 'node:fs';
import path from 'node:path';

import type { SourceFile, ScriptKind } from 'typescript';

type CacheEntry = {
	mtimeMs: number;
	sourceFile: SourceFile;
};

const cache = new Map<string, CacheEntry>();

let tsModulePromise: Promise<typeof import('typescript')> | null = null;

function loadTypeScript(): Promise<typeof import('typescript')>
{
	if (!tsModulePromise)
	{
		tsModulePromise = import('typescript').then((mod) => mod.default ?? mod);
	}

	return tsModulePromise;
}

export async function parseSource(filePath: string, content: string): Promise<SourceFile | null>
{
	const ts = await loadTypeScript();
	const key = path.resolve(filePath);

	const mtimeMs = mtimeOrZero(key);
	const cached = cache.get(key);
	if (cached && cached.mtimeMs === mtimeMs)
	{
		return cached.sourceFile;
	}

	let sourceFile: SourceFile;
	try
	{
		sourceFile = ts.createSourceFile(
			key,
			content,
			ts.ScriptTarget.ESNext,
			/* setParentNodes */ false,
			scriptKindFor(ts, key),
		);
	}
	catch
	{
		return null;
	}

	cache.set(key, { mtimeMs, sourceFile });

	return sourceFile;
}

function scriptKindFor(ts: typeof import('typescript'), filePath: string): ScriptKind
{
	const ext = path.extname(filePath).toLowerCase();
	switch (ext)
	{
		case '.ts':
		case '.mts':
		case '.cts':
			return ts.ScriptKind.TS;
		case '.tsx':
			return ts.ScriptKind.TSX;
		case '.jsx':
			return ts.ScriptKind.JSX;
		default:
			return ts.ScriptKind.JS;
	}
}

function mtimeOrZero(filePath: string): number
{
	try
	{
		return statSync(filePath).mtimeMs;
	}
	catch
	{
		return 0;
	}
}
