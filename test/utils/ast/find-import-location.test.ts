import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { findRelativeImportLocation } from '../../../src/utils/ast/find-import-location';

describe('findRelativeImportLocation', () => {
	let tmp: string;

	beforeEach(() => {
		tmp = mkdtempSync(path.join(os.tmpdir(), 'chef-find-import-'));
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	function writeFile(rel: string, content: string): string
	{
		const abs = path.join(tmp, rel);
		mkdirSync(path.dirname(abs), { recursive: true });
		writeFileSync(abs, content, 'utf-8');

		return abs;
	}

	it('locates an import whose specifier already includes the extension', async () => {
		const target = writeFile('foo.js', 'export const x = 1;');
		const importer = writeFile(
			'consumer.js',
			'// line 1\nimport { x } from "./foo.js";\n',
		);

		const loc = await findRelativeImportLocation(importer, target);

		assert.deepEqual(loc, { file: importer, line: 2, column: 1 });
	});

	it('locates an import whose specifier omits the extension', async () => {
		const target = writeFile('foo.ts', 'export const x = 1;');
		const importer = writeFile(
			'consumer.ts',
			'import { x } from "./foo";\n',
		);

		const loc = await findRelativeImportLocation(importer, target);

		assert.deepEqual(loc, { file: importer, line: 1, column: 1 });
	});

	it('locates a re-export form "export { x } from \'./foo\'"', async () => {
		const target = writeFile('foo.js', 'export const x = 1;');
		const importer = writeFile(
			'index.js',
			'// header\nexport { x } from "./foo";\n',
		);

		const loc = await findRelativeImportLocation(importer, target);

		assert.deepEqual(loc, { file: importer, line: 2, column: 1 });
	});

	it('resolves through a directory `index.js`', async () => {
		const target = writeFile('lib/index.js', 'export const x = 1;');
		const importer = writeFile(
			'consumer.js',
			'import { x } from "./lib";\n',
		);

		const loc = await findRelativeImportLocation(importer, target);

		assert.deepEqual(loc, { file: importer, line: 1, column: 1 });
	});

	it('ignores bare module specifiers (not relative)', async () => {
		const target = writeFile('foo.js', 'export const x = 1;');
		const importer = writeFile(
			'consumer.js',
			'import { x } from "ext.name";\n',
		);

		const loc = await findRelativeImportLocation(importer, target);

		assert.isNull(loc);
	});

	it('ignores imports that resolve elsewhere', async () => {
		const target = writeFile('foo.js', 'export const x = 1;');
		const other = writeFile('bar.js', 'export const y = 2;');
		const importer = writeFile(
			'consumer.js',
			'import { y } from "./bar";\n',
		);

		const loc = await findRelativeImportLocation(importer, target);

		assert.isNull(loc);
	});

	it('returns null when the importer file is unreadable', async () => {
		const target = writeFile('foo.js', 'export const x = 1;');
		const missing = path.join(tmp, 'does-not-exist.js');

		const loc = await findRelativeImportLocation(missing, target);

		assert.isNull(loc);
	});
});
