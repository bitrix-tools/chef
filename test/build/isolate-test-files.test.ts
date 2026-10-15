import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import { rollup } from 'rollup';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

import isolateTestFilesPlugin from '../../src/modules/engines/build/rollup/plugins/isolate-test-files';

type LoadError = { file: string; message: string };

describe('isolateTestFilesPlugin', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-isolate-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function writeFile(name: string, code: string): string
	{
		const file = path.join(tmpDir, name);
		fs.writeFileSync(file, code);

		return file;
	}

	async function bundle(entry: string, files: string[]): Promise<{ code: string; map: TraceMap }>
	{
		const build = await rollup({
			input: entry,
			treeshake: false,
			plugins: [isolateTestFilesPlugin({ files, loader: 'testLoader.load' })],
		});
		const { output } = await build.generate({ format: 'iife', name: 'Bundle', sourcemap: true });
		await build.close();

		return { code: output[0].code, map: new TraceMap(output[0].map as any) };
	}

	// Runs the bundle with a loader that records errors, like the page-side one does.
	function run(code: string): { registered: string[]; errors: LoadError[] }
	{
		const registered: string[] = [];
		const errors: LoadError[] = [];
		const testLoader = {
			load(file: string, body: () => void)
			{
				try
				{
					body();
				}
				catch (error)
				{
					errors.push({ file, message: (error as Error).message });
				}
			},
		};

		(globalThis as any).testLoader = testLoader;
		try
		{
			new Function('register', code)((name: string) => registered.push(name));
		}
		finally
		{
			delete (globalThis as any).testLoader;
		}

		return { registered, errors };
	}

	it('keeps loading the files after one that throws', async () => {
		const first = writeFile('first.test.js', "register('first');\n");
		const broken = writeFile('broken.test.js', "missingHelper();\nregister('broken');\n");
		const last = writeFile('last.test.js', "register('last');\n");
		const entry = writeFile('entry.js', [first, broken, last].map((file) => `import ${JSON.stringify(file)};`).join('\n'));

		const { code } = await bundle(entry, [first, broken, last]);
		const { registered, errors } = run(code);

		assert.deepEqual(registered, ['first', 'last']);
		assert.deepEqual(errors, [{ file: broken, message: 'missingHelper is not defined' }]);
	});

	it('keeps imports at the top level, including ones after the code', async () => {
		writeFile('helper.js', "export const name = 'helper';\n");
		const test = writeFile('a.test.js', "import { name } from './helper.js';\nregister(name);\nimport './side.js';\n");
		writeFile('side.js', "register('side');\n");

		const { code } = await bundle(test, [test]);

		assert.deepEqual(run(code).registered, ['side', 'helper']);
	});

	it('leaves a file with exports as is', async () => {
		const test = writeFile('exports.test.js', "export const value = 1;\nregister('exports');\n");

		const { code } = await bundle(test, [test]);

		assert.notInclude(code, 'testLoader.load');
	});

	it('wraps a file whose only export is the empty one that marks it as a module', async () => {
		const test = writeFile('module.test.js', "missingHelper();\nexport {};\n");

		const { code } = await bundle(test, [test]);

		assert.deepEqual(run(code).errors, [{ file: test, message: 'missingHelper is not defined' }]);
	});

	it('does not wrap modules that are not test files', async () => {
		writeFile('helper.js', "register('helper');\nexport {};\n");
		const plain = writeFile('plain.js', "import './helper.js';\nregister('plain');\n");

		const { code } = await bundle(plain, []);

		assert.notInclude(code, 'testLoader.load');
	});

	it('maps the wrapped code back to the original lines', async () => {
		const test = writeFile('mapped.test.js', "const value = 1;\nmissingHelper(value);\n");

		const { code, map } = await bundle(test, [test]);
		const lines = code.split('\n');
		const line = lines.findIndex((text) => text.includes('missingHelper')) + 1;
		const position = originalPositionFor(map, { line, column: lines[line - 1].indexOf('missingHelper') });

		assert.equal(position.line, 2);
		assert.equal(position.column, 0);
	});
});
