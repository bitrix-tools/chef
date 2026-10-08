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

type FixedTypeScript = { text: string; changed: number[]; program: unknown };

// TypeScript rejects these in Flow code whose syntax it reads well: the parts they name
// are blanked out. oxlint lints no file with such an error.
const FLOW_SEMANTIC_ERRORS = [
	'Type annotation cannot appear on a constructor declaration',
	"A 'set' accessor cannot have a return type annotation",
	"The left-hand side of a 'for...of' statement cannot use a type annotation",
	"The left-hand side of a 'for...in' statement cannot use a type annotation",
	'A required parameter cannot follow an optional parameter',
];

const FUNCTION_NODES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/**
 * Ranges to blank for FLOW_SEMANTIC_ERRORS: the return type of a constructor or a setter,
 * the type of a `for...of`/`for...in` variable, the `?` of an optional parameter followed
 * by a required one.
 */
function flowSemanticFixes(program: unknown, text: string): Array<[number, number]>
{
	const ranges: Array<[number, number]> = [];
	walk(program, (node) => {
		if (node.type === 'MethodDefinition' && (node.kind === 'constructor' || node.kind === 'set'))
		{
			const returnType = (node.value as AstNode | null)?.returnType as AstNode | null;
			if (returnType)
			{
				ranges.push([returnType.start, returnType.end]);
			}
		}

		if ((node.type === 'ForOfStatement' || node.type === 'ForInStatement') && (node.left as AstNode).type === 'VariableDeclaration')
		{
			for (const declarator of (node.left as AstNode).declarations as AstNode[])
			{
				const annotation = (declarator.id as AstNode).typeAnnotation as AstNode | null;
				if (annotation)
				{
					ranges.push([annotation.start, annotation.end]);
				}
			}
		}

		if (FUNCTION_NODES.has(node.type))
		{
			const params = node.params as AstNode[];
			let lastRequired = params.length - 1;
			while (lastRequired >= 0 && (params[lastRequired].type === 'RestElement' || params[lastRequired].type === 'AssignmentPattern' || params[lastRequired].optional === true))
			{
				lastRequired--;
			}

			for (const param of params.slice(0, Math.max(lastRequired, 0)))
			{
				const annotation = param.typeAnnotation as AstNode | null;
				const question = param.optional === true ? text.indexOf('?', param.start) : -1;
				if (question !== -1 && question < (annotation?.start ?? param.end))
				{
					ranges.push([question, question + 1]);
				}
			}
		}

		return true;
	});

	return ranges;
}

const IMPORT_DECLARATION = /^[ \t]*import\b[^;]*?\bfrom\s*['"][^'"\n]*['"]/gm;
const TYPEOF_IMPORT = /\btypeof(?=\s+[\p{ID_Start}$_])/gu;

/**
 * Flow's `import typeof X` and `import { typeof X }` become `import type   X`, which
 * TypeScript reads.
 */
function blankTypeofImports(source: string): { text: string; changed: number[] }
{
	const changed: number[] = [];
	const text = source.replace(IMPORT_DECLARATION, (declaration, offset: number) => declaration.replace(TYPEOF_IMPORT, (keyword, at: number) => {
		changed.push(offset + at + 4, offset + at + 5);

		return 'type  ';
	}));

	return { text, changed };
}

function blankRanges(text: string, ranges: Array<[number, number]>, changed: number[]): string
{
	// UTF-16 code units, like the positions
	const chars = text.split('');
	for (const [from, to] of ranges)
	{
		for (let i = from; i < to; i++)
		{
			if (chars[i] !== ' ' && chars[i] !== '\t' && chars[i] !== '\n' && chars[i] !== '\r')
			{
				chars[i] = ' ';
				changed.push(i);
			}
		}
	}

	return chars.join('');
}

/**
 * Blanks out what keeps Flow code from being valid TypeScript: the `?` of maybe types
 * (`?string` -> ` string`) and, for Flow files, FLOW_SEMANTIC_ERRORS. Otherwise returns
 * the error that keeps the text from parsing.
 */
function fixForTypeScript(fileName: string, source: string, flow: boolean): FixedTypeScript | { error: ParseError }
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

		const ranges: Array<[number, number]> = [];
		let semantic = false;
		for (const error of errors)
		{
			const start = error.labels?.[0]?.start;
			if (pass < 4 && error.message.startsWith(FLOW_MAYBE_TYPE) && start !== undefined && text[start] === '?')
			{
				ranges.push([start, start + 1]);
			}
			else if (pass < 4 && flow && FLOW_SEMANTIC_ERRORS.some((message) => error.message.startsWith(message)))
			{
				semantic = true;
			}
			else
			{
				return { error };
			}
		}

		if (semantic)
		{
			ranges.push(...flowSemanticFixes(result.program, text));
		}

		const before = changed.length;
		text = blankRanges(text, ranges, changed);
		if (changed.length === before)
		{
			return { error: errors[0] };
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

		const fixed = fixForTypeScript(filePath, text, false);

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

	const typeofImports = blankTypeofImports(text);
	const asTs = fixForTypeScript(`${filePath}.ts`, typeofImports.text, true);
	if (!('error' in asTs))
	{
		let { text: tsText, program } = asTs;
		const changed = [...typeofImports.changed, ...asTs.changed];
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
