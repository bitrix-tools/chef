import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { rollup } from 'rollup';

import typescriptPlugin from '../../src/modules/engines/build/rollup/plugins/typescript';

describe('bitrix-typescript syntax errors', () => {
	let tmp: string;

	beforeEach(() => {
		tmp = mkdtempSync(path.join(os.tmpdir(), 'chef-ts-syntax-'));
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	async function build(code: string): Promise<unknown>
	{
		const entry = path.join(tmp, 'index.ts');
		writeFileSync(entry, code, 'utf-8');

		const plugin = await typescriptPlugin({ packageRoot: tmp, compilerOptions: {}, include: ['**'], exclude: [] });

		try
		{
			const bundle = await rollup({ input: entry, plugins: [plugin] });
			await bundle.close();

			return null;
		}
		catch (error)
		{
			return error;
		}
	}

	it('reports a syntax error at its position in the source', async () => {
		// TypeScript reads the first lines as declarations with type annotations: the error
		// is where the stray parenthesis is, not where the transpiled output breaks.
		const error = await build('const compare =\n\titemA,\n\titemB: string,\n) => 1;\n') as {
			pluginCode?: string;
			loc?: { line: number; column: number };
			message: string;
		};

		assert.isNotNull(error);
		assert.equal(error.pluginCode, 'CF1002');
		assert.deepInclude(error.loc, { line: 4, column: 0 });
		assert.include(error.message, 'TS1128');
	});

	it('does not stop the build on a type error', async () => {
		const error = await build("const value: number = 'text';\nexport { value };\n");

		assert.isNull(error);
	});
});
