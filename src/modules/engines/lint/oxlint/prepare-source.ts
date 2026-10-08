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
	// Flow file linted as TypeScript (`<name>.js.ts`): `?Type` loses its `?`, `{[K]: V}`
	// becomes `{ K : V}`; `typeRanges` are the type annotations, which ESLint did not format
	| { kind: 'flow-as-ts'; text: string; changed: number[]; typeRanges: Array<[number, number]> }
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

type AstNode = { type: string; start: number; end: number; [key: string]: unknown };

function walk(root: unknown, visit: (node: AstNode) => boolean | void): void
{
	const stack: unknown[] = [root];
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

		const node = current as AstNode;
		if (typeof node.type === 'string' && visit(node) === false)
		{
			continue;
		}

		for (const key in node)
		{
			const value = node[key];
			if (key !== 'parent' && value && typeof value === 'object')
			{
				stack.push(value);
			}
		}
	}
}

// Type-only syntax: ESLint read Flow types through Babel and did not format them.
const TYPE_NODES = new Set([
	'TSTypeAnnotation',
	'TSTypeAliasDeclaration',
	'TSInterfaceDeclaration',
	'TSTypeParameterDeclaration',
	'TSTypeParameterInstantiation',
]);

function typeRanges(program: unknown): Array<[number, number]>
{
	const ranges: Array<[number, number]> = [];
	walk(program, (node) => {
		if (TYPE_NODES.has(node.type))
		{
			ranges.push([node.start, node.end]);

			return false;
		}

		return true;
	});

	return ranges;
}

/**
 * Flow's unnamed indexer `{[K]: V}` is valid TypeScript with another meaning: a computed
 * key referencing a value `K`. Blanking the brackets (`{ K : V}`) turns it into a plain
 * property, which keeps the length and references nothing. Returns the blanked positions.
 */
function unnamedIndexerBrackets(program: unknown, text: string): number[]
{
	const positions: number[] = [];
	walk(program, (node) => {
		if (node.type !== 'TSPropertySignature' || node.computed !== true)
		{
			return true;
		}

		const key = node.key as AstNode;
		if (key.type !== 'Identifier')
		{
			return true;
		}

		const open = text.lastIndexOf('[', key.start);
		const close = text.indexOf(']', key.end);
		if (open >= node.start && close !== -1 && close < node.end)
		{
			positions.push(open, close);
		}

		return true;
	});

	return positions;
}

type FixedMaybeTypes = { text: string; changed: number[]; program: unknown };

/**
 * Blanks out the `?` of Flow maybe types (`?string` -> ` string`) until the text is valid
 * TypeScript. Otherwise returns the error that keeps it from parsing.
 */
function fixMaybeTypes(fileName: string, source: string): FixedMaybeTypes | { error: ParseError }
{
	let text = source;
	const changed: number[] = [];

	// a maybe type nested in another one (`?Array<?string>`) is reported on the next pass
	for (let pass = 0; ; pass++)
	{
		const result = parse(fileName, text, 'ts');
		const errors = result.errors as ParseError[];
		if (errors.length === 0)
		{
			return { text, changed, program: result.program };
		}

		for (const error of errors)
		{
			const start = error.labels?.[0]?.start;
			if (pass === 3 || !error.message.startsWith(FLOW_MAYBE_TYPE) || start === undefined || text[start] !== '?')
			{
				return { error };
			}
		}

		for (const error of errors)
		{
			const start = error.labels![0].start;
			text = `${text.slice(0, start)} ${text.slice(start + 1)}`;
			changed.push(start);
		}
	}
}

function stripFlowTypes(fileName: string, source: string): PreparedSource | null
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

	return { kind: 'stripped', text, changed };
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

		return 'error' in fixed ? { kind: 'native' } : { kind: 'ts-fixed', text: fixed.text, changed: fixed.changed };
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
	if (!('error' in asTs))
	{
		let { text: tsText, program } = asTs;
		const changed = [...asTs.changed];
		const brackets = unnamedIndexerBrackets(program, tsText);
		if (brackets.length > 0)
		{
			for (const position of brackets)
			{
				tsText = `${tsText.slice(0, position)} ${tsText.slice(position + 1)}`;
			}
			changed.push(...brackets);

			const reparsed = parse(`${filePath}.ts`, tsText, 'ts');
			if (reparsed.errors.length > 0)
			{
				return stripFlowTypes(filePath, text) ?? unparsable(jsErrors);
			}
			program = reparsed.program;
		}

		return { kind: 'flow-as-ts', text: tsText, changed: changed.sort((a, b) => a - b), typeRanges: typeRanges(program) };
	}

	// a Flow file stops the JavaScript parser at its first type annotation, which tells
	// nothing; the TypeScript parser gets past the types to the real error
	return stripFlowTypes(filePath, text) ?? unparsable([asTs.error]);
}

function unparsable(errors: ParseError[]): PreparedSource
{
	return {
		kind: 'unparsable',
		message: errors[0].message,
		offset: errors[0].labels?.[0]?.start ?? 0,
	};
}

/**
 * Name of the shadow copy relative to the shadow root.
 */
export function shadowName(relativePath: string, source: PreparedSource): string
{
	return source.kind === 'flow-as-ts' ? `${relativePath}.ts` : relativePath;
}
