import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import typescriptPlugin from '../../src/modules/engines/build/rollup/plugins/typescript';

type ResolveIdHook = (source: string, importer?: string) => string | null | Promise<string | null>;

describe('bitrix-typescript resolveId', () => {
	let tmp: string;
	let resolveId: ResolveIdHook;
	let importer: string;

	beforeEach(async () => {
		tmp = mkdtempSync(path.join(os.tmpdir(), 'chef-ts-resolve-'));
		mkdirSync(path.join(tmp, 'src'), { recursive: true });
		importer = path.join(tmp, 'src/index.ts');
		writeFileSync(importer, '', 'utf-8');

		const plugin = await typescriptPlugin({
			packageRoot: tmp,
			compilerOptions: {},
		});

		// The resolveId hook on a Rollup plugin can be a function or an object {handler}.
		const raw = (plugin as { resolveId: unknown }).resolveId;
		resolveId = (typeof raw === 'function' ? raw : (raw as { handler: ResolveIdHook }).handler)
			.bind({}) as ResolveIdHook;
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	function writeFile(rel: string, content: string = ''): string
	{
		const abs = path.join(tmp, rel);
		mkdirSync(path.dirname(abs), { recursive: true });
		writeFileSync(abs, content, 'utf-8');

		return abs;
	}

	it('resolves `./lib` to ./lib.ts when such file exists', async () => {
		const target = writeFile('src/lib.ts');

		const resolved = await resolveId('./lib', importer);

		assert.equal(resolved, target);
	});

	it('resolves `./lib` to ./lib/index.ts when ./lib is a directory', async () => {
		const target = writeFile('src/lib/index.ts');

		const resolved = await resolveId('./lib', importer);

		assert.equal(resolved, target);
	});

	it('prefers ./lib.ts over ./lib/index.ts when both exist', async () => {
		const target = writeFile('src/lib.ts');
		writeFile('src/lib/index.ts');

		const resolved = await resolveId('./lib', importer);

		assert.equal(resolved, target, 'A file should win over a same-name directory');
	});

	it('resolves trailing-slash imports to ./lib/index.ts only', async () => {
		const target = writeFile('src/lib/index.ts');
		// Even if a same-named file exists, `./lib/` forces a directory lookup.
		writeFile('src/lib.ts');

		const resolved = await resolveId('./lib/', importer);

		assert.equal(resolved, target);
	});

	it('resolves explicit `./lib/index` to ./lib/index.ts', async () => {
		const target = writeFile('src/lib/index.ts');

		const resolved = await resolveId('./lib/index', importer);

		assert.equal(resolved, target);
	});

	it('tries each TS extension in order: .ts, .tsx, .mts, .cts', async () => {
		const target = writeFile('src/lib/index.tsx');

		const resolved = await resolveId('./lib', importer);

		assert.equal(resolved, target);
	});

	it('returns null for bare specifiers (handled by other plugins)', async () => {
		const resolved = await resolveId('main.core', importer);

		assert.isNull(resolved);
	});

	it('returns null when the specifier already includes an extension', async () => {
		writeFile('src/lib.ts');
		// `./lib.js` is a separate concern — TS impersonating JS is intentionally not handled here.
		const resolved = await resolveId('./lib.js', importer);

		assert.isNull(resolved);
	});

	it('returns null when nothing matches (lets node-resolve take over)', async () => {
		const resolved = await resolveId('./does-not-exist', importer);

		assert.isNull(resolved);
	});

	it('returns null when ./lib exists as a directory but has no index.{ts,tsx,mts,cts}', async () => {
		writeFile('src/lib/other.ts');

		const resolved = await resolveId('./lib', importer);

		assert.isNull(resolved, 'Directory without an index must fall through');
	});
});
