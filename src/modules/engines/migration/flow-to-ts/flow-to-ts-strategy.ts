import * as parser from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';

import { MigrationStrategy } from '../migration-strategy';
import { flowCommentsVisitor } from './visitors/flow-comments';
import { flowImportsVisitor } from './visitors/flow-imports';
import { flowTypesVisitor } from './visitors/flow-types';
import { flowClassVisitor } from './visitors/flow-class';

import type { MigrationOptions, MigrationResult } from '../migration-types';

// CJS interop: when loaded via dynamic import(), default exports get double-wrapped
const traverse = (traverseModule as any).default ?? traverseModule;
const generate = (generateModule as any).default ?? generateModule;

export class FlowToTsStrategy extends MigrationStrategy
{
	async migrate(options: MigrationOptions): Promise<MigrationResult>
	{
		try
		{
			const ast = parser.parse(options.code, {
				sourceType: 'module',
				plugins: ['flow'],
			});

			traverse(ast, {
				...flowCommentsVisitor,
				...flowImportsVisitor,
				...flowTypesVisitor,
				...flowClassVisitor,
			});

			const result = generate(ast, {
				retainLines: true,
				compact: false,
			}, options.code);

			const code = await this.#format(result.code);

			return { code, success: true };
		}
		catch
		{
			return { code: options.code, success: false };
		}
	}

	async #format(code: string): Promise<string>
	{
		let formatted = code.replace(/type\n/g, 'type ');

		const prettier = await import('prettier');

		formatted = await prettier.format(formatted, {
			parser: 'typescript',
			useTabs: true,
			singleQuote: true,
			trailingComma: 'all',
			plugins: [
				await import('prettier-plugin-brace-style'),
			],
			braceStyle: 'allman',
			arrowParens: 'always',
			printWidth: 120,
		});

		formatted = formatted.trim();
		formatted = formatted.replace(/=>\s+/g, '=> ');

		const regexVoidToUndefined = /(\w+)\s+\|\snull\s\|\svoid/g;
		formatted = formatted.replace(regexVoidToUndefined, '$1 | null | undefined');

		return formatted;
	}
}
