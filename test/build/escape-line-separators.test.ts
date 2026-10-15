import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import { rollup } from 'rollup';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

import escapeLineSeparatorsPlugin from '../../src/modules/engines/build/rollup/plugins/escape-line-separators';

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

describe('escapeLineSeparatorsPlugin', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-separators-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	async function bundle(source: string): Promise<{ code: string; map: TraceMap }>
	{
		const entry = path.join(tmpDir, 'entry.js');
		fs.writeFileSync(entry, source);

		const build = await rollup({ input: entry, treeshake: false, plugins: [escapeLineSeparatorsPlugin()] });
		const { output } = await build.generate({ format: 'iife', name: 'Bundle', sourcemap: true });
		await build.close();

		return { code: output[0].code, map: new TraceMap(output[0].map as any) };
	}

	it('escapes the separators and keeps the string value', async () => {
		const { code } = await bundle(`export const value = '${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}';\n`);

		assert.notInclude(code, LINE_SEPARATOR);
		assert.notInclude(code, PARAGRAPH_SEPARATOR);
		assert.equal(new Function(`${code}\nreturn Bundle.value;`)(), LINE_SEPARATOR + PARAGRAPH_SEPARATOR);
	});

	it('keeps the lines below a separator where the source map puts them', async () => {
		const { code, map } = await bundle(`export const value = '${LINE_SEPARATOR}';\nexport function fail() { throw new Error('boom'); }\n`);

		// The engine numbers lines the way the stack trace will report them.
		let stack = '';
		try
		{
			new Function(`${code}\nBundle.fail();`)();
		}
		catch (error)
		{
			stack = (error as Error).stack;
		}

		const [, line, column] = /<anonymous>:(\d+):(\d+)/.exec(stack);
		// new Function adds two lines of its own before the body.
		const position = originalPositionFor(map, { line: Number(line) - 2, column: Number(column) - 1 });

		assert.equal(position.line, 2);
	});

	it('leaves code without separators untouched', async () => {
		const source = "export const value = 'plain';\n";

		const { code } = await bundle(source);

		assert.include(code, "const value = 'plain';");
	});
});
