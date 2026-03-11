import * as parser from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';

import type { TraverseOptions } from '@babel/traverse';

// CJS interop: default exports may get double-wrapped
const traverse = (traverseModule as any).default ?? traverseModule;
const generate = (generateModule as any).default ?? generateModule;

export function applyVisitor(code: string, visitor: TraverseOptions): string
{
	const ast = parser.parse(code, {
		sourceType: 'module',
		plugins: ['flow'],
	});

	traverse(ast, visitor);

	return generate(ast, { retainLines: false, compact: false }, code).code;
}
