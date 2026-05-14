import { assert } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { analyzeReExports } from '../../../../src/commands/diag/analyzers/re-exports-analyzer';
import { createSnapshot } from '../create-snapshot';

import type { BasePackage } from '../../../../src/modules/packages/base-package';

type FakePackageSpec = {
	name: string;
	namespace?: string;
	files: Record<string, string>;
};

describe('analyzeReExports', () => {
	let tmpRoot: string;

	beforeEach(() => {
		tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'chef-re-exports-test-'));
	});

	afterEach(() => {
		rmSync(tmpRoot, { recursive: true, force: true });
	});

	function buildPackages(specs: FakePackageSpec[]): {
		snapshots: ReturnType<typeof createSnapshot>[];
		getPackage: (name: string) => BasePackage | null;
	}
	{
		const packageByName = new Map<string, BasePackage>();
		const snapshots = specs.map((spec) => {
			const packageRoot = path.join(tmpRoot, spec.name.replace(/[./]/g, '_'));
			mkdirSync(packageRoot, { recursive: true });

			const sourceFiles: string[] = [];
			for (const [relPath, content] of Object.entries(spec.files))
			{
				const fullPath = path.join(packageRoot, relPath);
				mkdirSync(path.dirname(fullPath), { recursive: true });
				writeFileSync(fullPath, content, 'utf-8');
				sourceFiles.push(fullPath);
			}

			const pkg = {
				getName: () => spec.name,
				getPath: () => packageRoot,
				getSourceFiles: () => sourceFiles,
			} as unknown as BasePackage;
			packageByName.set(spec.name, pkg);

			return createSnapshot({ name: spec.name, namespace: spec.namespace ?? '', path: packageRoot });
		});

		return {
			snapshots,
			getPackage: (name) => packageByName.get(name) ?? null,
		};
	}

	it('detects named re-export "export { Foo } from \'ext\'"', async () => {
		const { snapshots, getPackage } = buildPackages([
			{ name: 'ext.a', namespace: 'BX.A', files: { 'src/index.js': "export { Foo } from 'ext.b';" } },
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.js': 'export const Foo = 1;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results.length, 1);
		assert.equal(results[0].name, 'ext.a');
		assert.equal(results[0].entries.length, 1);
		assert.equal(results[0].entries[0].source, 'ext.b');
		assert.deepEqual(results[0].entries[0].symbols, ['Foo']);
		assert.equal(results[0].entries[0].wildcard, false);
	});

	it('records the renamed symbol from "export { Foo as Bar } from \'ext\'"', async () => {
		const { snapshots, getPackage } = buildPackages([
			{ name: 'ext.a', namespace: 'BX.A', files: { 'src/index.js': "export { Foo as Bar } from 'ext.b';" } },
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.js': 'export const Foo = 1;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.deepEqual(results[0].entries[0].symbols, ['Bar']);
	});

	it('detects wildcard re-export "export * from \'ext\'"', async () => {
		const { snapshots, getPackage } = buildPackages([
			{ name: 'ext.a', namespace: 'BX.A', files: { 'src/index.js': "export * from 'ext.b';" } },
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.js': 'export const Foo = 1;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results[0].entries[0].wildcard, true);
		assert.deepEqual(results[0].entries[0].symbols, ['*']);
	});

	it('detects namespace re-export "export * as Ns from \'ext\'"', async () => {
		const { snapshots, getPackage } = buildPackages([
			{ name: 'ext.a', namespace: 'BX.A', files: { 'src/index.js': "export * as Lib from 'ext.b';" } },
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.js': 'export const Foo = 1;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results[0].entries[0].wildcard, true);
		assert.deepEqual(results[0].entries[0].symbols, ['* as Lib']);
	});

	it('detects indirect re-export via import + bare export', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: 'BX.A',
				files: {
					'src/index.js': `
import { Foo, Bar } from 'ext.b';
export { Foo, Bar };
`,
				},
			},
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.js': 'export const Foo = 1; export const Bar = 2;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results.length, 1);
		assert.deepEqual(results[0].entries[0].symbols.sort(), ['Bar', 'Foo']);
		assert.equal(results[0].entries[0].source, 'ext.b');
	});

	it('detects indirect re-export with import renaming', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: 'BX.A',
				files: {
					'src/index.js': `
import { Foo as F } from 'ext.b';
export { F };
`,
				},
			},
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.js': 'export const Foo = 1;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.deepEqual(results[0].entries[0].symbols, ['F']);
	});

	it('ignores "import type" + "export type" — they are erased at transpile time', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: 'BX.A',
				files: {
					'src/index.ts': `
import type { Foo } from 'ext.b';
export type { Foo };
`,
				},
			},
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.ts': 'export type Foo = number;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results.length, 0);
	});

	it('ignores inline "export type { Foo } from \'ext\'"', async () => {
		const { snapshots, getPackage } = buildPackages([
			{ name: 'ext.a', namespace: 'BX.A', files: { 'src/index.ts': "export type { Foo } from 'ext.b';" } },
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.ts': 'export type Foo = number;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results.length, 0);
	});

	it('filters out individual "{ type Foo }" specifiers but keeps value ones', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: 'BX.A',
				files: { 'src/index.ts': "export { Value, type TypeOnly } from 'ext.b';" },
			},
			{
				name: 'ext.b',
				namespace: 'BX.B',
				files: { 'src/index.ts': 'export const Value = 1; export type TypeOnly = number;' },
			},
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results.length, 1);
		assert.deepEqual(results[0].entries[0].symbols, ['Value']);
	});

	it('ignores re-exports from unknown packages', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: 'BX.A',
				files: { 'src/index.js': "export { Foo } from 'some-npm-package';" },
			},
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results.length, 0);
	});

	it('ignores relative re-exports', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: 'BX.A',
				files: {
					'src/index.js': "export { Foo } from './internals';",
					'src/internals.js': 'export const Foo = 1;',
				},
			},
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results.length, 0);
	});

	it('flags same-namespace re-exports via sameNamespaceCount', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: 'BX.Shared',
				files: { 'src/index.js': "export { Foo } from 'ext.b';" },
			},
			{ name: 'ext.b', namespace: 'BX.Shared', files: { 'src/index.js': 'export const Foo = 1;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results[0].sameNamespaceCount, 1);
	});

	it('does not flag cross-namespace re-exports as same-namespace', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: 'BX.A',
				files: { 'src/index.js': "export { Foo } from 'ext.b';" },
			},
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.js': 'export const Foo = 1;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results[0].sameNamespaceCount, 0);
	});

	it('does not treat empty-namespace packages as "same namespace"', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: '',
				files: { 'src/index.js': "export { Foo } from 'ext.b';" },
			},
			{ name: 'ext.b', namespace: '', files: { 'src/index.js': 'export const Foo = 1;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results[0].sameNamespaceCount, 0);
	});

	it('detects self-reference (re-export from own package name)', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: 'BX.A',
				files: { 'src/index.js': "export { Foo } from 'ext.a';" },
			},
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results.length, 1);
		assert.equal(results[0].entries[0].source, 'ext.a');
	});

	it('aggregates symbols from multiple files of the same package', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: 'BX.A',
				files: {
					'src/one.js': "export { Foo } from 'ext.b';",
					'src/two.js': "export { Bar } from 'ext.b';",
				},
			},
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.js': 'export const Foo = 1; export const Bar = 2;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results.length, 1);
		// Different files → two separate entries with one symbol each
		assert.equal(results[0].entries.length, 2);
		const symbols = results[0].entries.flatMap((e) => e.symbols).sort();
		assert.deepEqual(symbols, ['Bar', 'Foo']);
	});

	it('sorts results: same-namespace first, then by entry count, then by name', async () => {
		const { snapshots, getPackage } = buildPackages([
			// 1 cross-namespace re-export, alphabetically last
			{ name: 'ext.z', namespace: 'BX.Z', files: { 'src/index.js': "export { Foo } from 'ext.target1';" } },
			// 1 same-namespace re-export — should be first
			{ name: 'ext.b', namespace: 'BX.Shared', files: { 'src/index.js': "export { Foo } from 'ext.target2';" } },
			// 2 cross-namespace re-exports — should come before ext.z (more entries)
			{
				name: 'ext.a',
				namespace: 'BX.A',
				files: {
					'src/one.js': "export { X } from 'ext.target1';",
					'src/two.js': "export { Y } from 'ext.target2';",
				},
			},
			{ name: 'ext.target1', namespace: 'BX.Shared', files: { 'src/index.js': 'export const Foo = 1; export const X = 1;' } },
			{ name: 'ext.target2', namespace: 'BX.Shared', files: { 'src/index.js': 'export const Foo = 1; export const Y = 1;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.deepEqual(results.map((r) => r.name), ['ext.b', 'ext.a', 'ext.z']);
	});

	it('returns empty array when no re-exports are present', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: 'BX.A',
				files: { 'src/index.js': "import { Foo } from 'ext.b'; console.log(Foo);" },
			},
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.js': 'export const Foo = 1;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results.length, 0);
	});

	it('records correct file path (relative to package root) and 1-based line number', async () => {
		const { snapshots, getPackage } = buildPackages([
			{
				name: 'ext.a',
				namespace: 'BX.A',
				files: {
					'src/index.js': "// line 1\n// line 2\nexport { Foo } from 'ext.b';\n",
				},
			},
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.js': 'export const Foo = 1;' } },
		]);

		const results = await analyzeReExports(snapshots, getPackage);

		assert.equal(results[0].entries[0].file, path.join('src', 'index.js'));
		assert.equal(results[0].entries[0].line, 3);
	});

	it('calls onProgress for each package', async () => {
		const { snapshots, getPackage } = buildPackages([
			{ name: 'ext.a', namespace: 'BX.A', files: { 'src/index.js': "export { Foo } from 'ext.b';" } },
			{ name: 'ext.b', namespace: 'BX.B', files: { 'src/index.js': 'export const Foo = 1;' } },
		]);

		const progress: Array<{ current: number; total: number; name: string }> = [];
		await analyzeReExports(snapshots, getPackage, (current, total, name) => {
			progress.push({ current, total, name });
		});

		assert.equal(progress.length, 2);
		assert.deepEqual(progress.map((p) => p.current), [1, 2]);
		assert.equal(progress[0].total, 2);
		assert.equal(progress[1].total, 2);
	});
});
