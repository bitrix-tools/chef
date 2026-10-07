import * as path from 'node:path';

import { parseSync } from 'oxc-parser';
import flowRemoveTypes from 'flow-remove-types';

/**
 * How a file is handed to oxlint. oxlint has no Flow parser, so Flow files go through a
 * shadow copy that oxlint can parse. Every transformation keeps the length of the text,
 * so positions in the copy are positions in the original.
 */
export type PreparedSource =
	// lint the file in place
	| { kind: 'native' }
	// Flow file linted as TypeScript (`<name>.js.ts`): `?Type` loses its `?`
	| { kind: 'flow-as-ts'; text: string; changed: number[] }
	// TypeScript file with Flow-style `?Type`: same fix, same name
	| { kind: 'ts-fixed'; text: string; changed: number[] }
	// Flow file oxlint cannot parse as TypeScript: types are blanked out
	| { kind: 'stripped'; text: string; changed: number[] }
	// nothing parses it; oxlint would skip such a file silently
	| { kind: 'unparsable'; message: string; offset: number };

const JS_EXTENSIONS = new Set(['.js', '.mjs', '.jsx']);
const TS_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.tsx']);
const FLOW_MAYBE_TYPE = "'?' at the start of a type";

type ParseError = { message: string; labels?: Array<{ start: number; end: number }> };

function parse(fileName: string, text: string, lang: 'js' | 'ts')
{
	return parseSync(fileName, text, {
		lang,
		sourceType: 'unambiguous',
		showSemanticErrors: lang === 'ts',
	});
}

function parseErrors(fileName: string, text: string, lang: 'js' | 'ts'): ParseError[]
{
	return parse(fileName, text, lang).errors as ParseError[];
}

/**
 * Flow's unnamed indexer `{ [string]: T }` is valid TypeScript with another meaning: a
 * computed key that references a value named `string`. A Flow file with one cannot be
 * linted as TypeScript.
 */
function hasComputedTypeKey(node: unknown): boolean
{
	const stack: unknown[] = [node];
	while (stack.length > 0)
	{
		const current = stack.pop();
		if (!current || typeof current !== 'object')
		{
			continue;
		}

		if (Array.isArray(current))
		{
			stack.push(...current);
			continue;
		}

		const record = current as Record<string, unknown>;
		if (record.type === 'TSPropertySignature' && record.computed === true)
		{
			return true;
		}

		for (const key in record)
		{
			if (key !== 'parent')
			{
				const value = record[key];
				if (value && typeof value === 'object')
				{
					stack.push(value);
				}
			}
		}
	}

	return false;
}

/**
 * Blanks out the `?` of Flow maybe types (`?string` -> ` string`) until the text is valid
 * TypeScript. Returns null if anything else keeps it from parsing.
 */
function fixMaybeTypes(fileName: string, source: string): { text: string; changed: number[] } | null
{
	let text = source;
	const changed: number[] = [];

	for (let pass = 0; pass < 3; pass++)
	{
		const result = parse(fileName, text, 'ts');
		const errors = result.errors as ParseError[];
		if (errors.length === 0)
		{
			return hasComputedTypeKey(result.program) ? null : { text, changed };
		}

		for (const error of errors)
		{
			const start = error.labels?.[0]?.start;
			if (!error.message.startsWith(FLOW_MAYBE_TYPE) || start === undefined || text[start] !== '?')
			{
				return null;
			}
		}

		for (const error of errors)
		{
			const start = error.labels![0].start;
			text = `${text.slice(0, start)} ${text.slice(start + 1)}`;
			changed.push(start);
		}
	}

	return null;
}

function stripFlowTypes(fileName: string, source: string): { text: string; changed: number[] } | null
{
	let text: string;
	try
	{
		text = flowRemoveTypes(source, { all: true }).toString();
	}
	catch
	{
		return null;
	}

	if (text.length !== source.length || parseErrors(fileName, text, 'js').length > 0)
	{
		return null;
	}

	const changed: number[] = [];
	for (let i = 0; i < text.length; i++)
	{
		if (text[i] !== source[i])
		{
			changed.push(i);
		}
	}

	return { text, changed };
}

export function prepareSource(filePath: string, text: string): PreparedSource
{
	const extension = path.extname(filePath);

	if (TS_EXTENSIONS.has(extension))
	{
		const errors = parseErrors(filePath, text, 'ts');
		if (errors.length === 0 || !errors.every((error) => error.message.startsWith(FLOW_MAYBE_TYPE)))
		{
			return { kind: 'native' };
		}

		const fixed = fixMaybeTypes(filePath, text);

		return fixed ? { kind: 'ts-fixed', ...fixed } : { kind: 'native' };
	}

	if (!JS_EXTENSIONS.has(extension))
	{
		return { kind: 'native' };
	}

	const jsErrors = parseErrors(filePath, text, 'js');
	if (jsErrors.length === 0)
	{
		return { kind: 'native' };
	}

	const asTs = fixMaybeTypes(`${filePath}.ts`, text);
	if (asTs)
	{
		return { kind: 'flow-as-ts', ...asTs };
	}

	const stripped = stripFlowTypes(filePath, text);
	if (stripped)
	{
		return { kind: 'stripped', ...stripped };
	}

	return {
		kind: 'unparsable',
		message: jsErrors[0].message,
		offset: jsErrors[0].labels?.[0]?.start ?? 0,
	};
}

/**
 * Name of the shadow copy relative to the shadow root.
 */
export function shadowName(relativePath: string, source: PreparedSource): string
{
	return source.kind === 'flow-as-ts' ? `${relativePath}.ts` : relativePath;
}
