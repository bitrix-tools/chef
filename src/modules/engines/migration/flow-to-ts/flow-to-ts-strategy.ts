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

			let code = this.#postProcess(result.code);
			code = await this.#format(code);

			return { code, success: true };
		}
		catch
		{
			return { code: options.code, success: false };
		}
	}

	#postProcess(code: string): string
	{
		let result = code;

		// $Values<T> → T[keyof T]
		result = result.replace(/\$Values<(\w+)>/g, '$1[keyof $1]');

		// [$Keys<T>]: V → [K in keyof T]: V (mapped type in index position)
		result = result.replace(/\[\$Keys<(\w+)>\]/g, '[K in keyof $1]');

		// $Keys<T> → keyof T (standalone usage)
		result = result.replace(/\$Keys<(\w+)>/g, 'keyof $1');

		// $Diff<T, U> → Omit<T, keyof U>
		result = result.replace(/\$Diff<(\w+),\s*(\w+)>/g, 'Omit<$1, keyof $2>');

		// $PropertyType<T, K> → T[K]
		result = result.replace(/\$PropertyType<(\w+),\s*('[^']+')>/g, '$1[$2]');
		result = result.replace(/\$PropertyType<(\w+),\s*("[^"]+")>/g, '$1[$2]');

		// $ElementType<T, K> → T[K]
		result = result.replace(/\$ElementType<(\w+),\s*(\w+)>/g, '$1[$2]');

		// Class<T> → (new (...args: any[]) => T)
		result = result.replace(/Class<(\w+)>/g, '(new (...args: any[]) => $1)');

		// Object<K, V> → Record<K, V> (but not plain Object without generics)
		// Innermost first, then outer — handles nesting
		for (let i = 0; i < 5; i++)
		{
			const next = result.replace(/\bObject<((?:[^<>]|<[^<>]*>)*)>/g, 'Record<$1>');
			if (next === result) break;
			result = next;
		}

		// {...} → Record<string, any> (Flow inexact empty object type)
		result = result.replace(/\{\s*\.\.\.\s*\}/g, 'Record<string, any>');

		// [string: keyName] → [keyName: string] (Flow index signature syntax)
		result = result.replace(/\[string:\s*(\w+)\]/g, '[$1: string]');
		result = result.replace(/\[number:\s*(\w+)\]/g, '[$1: number]');

		return result;
	}

	async #format(code: string): Promise<string>
	{
		// Babel generator with retainLines may produce "type\n\nFoo" instead of "type Foo"
		let formatted = code.replace(/\btype\s*\n\s*\n?\s*(\w)/g, 'type $1');

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
