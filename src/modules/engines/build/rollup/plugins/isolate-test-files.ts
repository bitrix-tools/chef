import MagicString from 'magic-string';
import type { Plugin } from 'rollup';

import { normalizePath } from '../../../../../utils/path/normalize';

type Statement = {
	type: string;
	start: number;
	end: number;
	declaration?: unknown;
	source?: unknown;
	specifiers?: unknown[];
};

type IsolateTestFilesOptions = {
	files: string[];
	// Global function the wrapped body is handed to: `globalThis[loader](file, body)`.
	loader: string;
};

/**
 * Wraps the top-level code of every test file into a function passed to a page-side
 * loader. In an IIFE bundle all modules run in one script, so an error thrown while
 * one file loads would stop every file after it from registering its tests. The loader
 * runs the body in try/catch and reports the error against that file instead.
 *
 * Import declarations stay outside the wrapper (they must be top-level). A file with
 * exports is left as is: its declarations can't be moved into a function scope.
 */
export default function isolateTestFilesPlugin(options: IsolateTestFilesOptions): Plugin
{
	const files = new Set(options.files.map((file) => normalizePath(file)));

	return {
		name: 'isolate-test-files',

		transform(code, id)
		{
			if (!files.has(normalizePath(id)))
			{
				return null;
			}

			const program = this.parse(code);
			const statements = program.body as unknown as Statement[];

			// `export {}` only marks a TypeScript file as a module: it stays top-level too.
			const isTopLevel = (node: Statement): boolean => node.type === 'ImportDeclaration'
				|| (node.type === 'ExportNamedDeclaration' && !node.declaration && !node.source && node.specifiers.length === 0);

			if (statements.some((node) => node.type.startsWith('Export') && !isTopLevel(node)))
			{
				return null;
			}

			const body = statements.filter((node) => !isTopLevel(node));
			if (body.length === 0)
			{
				return null;
			}

			const bodyStart = body[0].start;
			const bodyEnd = body.at(-1).end;
			const magic = new MagicString(code);

			for (const node of statements)
			{
				if (isTopLevel(node) && node.start > bodyStart)
				{
					magic.move(node.start, node.end, bodyStart);
				}
			}

			magic.prependRight(bodyStart, `globalThis.${options.loader}(${JSON.stringify(normalizePath(id))}, () => {\n`);
			magic.appendLeft(bodyEnd, '\n});');

			return {
				code: magic.toString(),
				map: magic.generateMap({ hires: true }),
			};
		},
	};
}
