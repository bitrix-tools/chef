import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { DeclarationEmitter } from '../../src/modules/engines/build/declaration-emitter';

let tmpDir: string;

function writeFile(filePath: string, content: string): void
{
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, 'utf-8');
}

function createNpmPackage(params: {
	packageRoot: string;
	pkgName: string;
	typings: string;
	packageJson?: Record<string, unknown>;
}): void
{
	const { packageRoot, pkgName, typings, packageJson } = params;
	const pkgDir = path.join(packageRoot, 'node_modules', pkgName);
	writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({
		name: pkgName,
		version: '0.0.0',
		types: 'index.d.ts',
		...packageJson,
	}, null, 2));
	writeFile(path.join(pkgDir, 'index.d.ts'), typings);
}

function createExtension(files: Record<string, string>): { packageRoot: string; input: string }
{
	const srcDir = path.join(tmpDir, 'src');
	fs.mkdirSync(srcDir, { recursive: true });

	let inputPath = '';
	for (const [rel, content] of Object.entries(files))
	{
		const full = path.join(srcDir, rel);
		writeFile(full, content);
		if (!inputPath || rel === 'index.ts') inputPath = full;
	}

	return { packageRoot: tmpDir, input: inputPath };
}

async function emitAndRead(
	files: Record<string, string>,
	params: { namespace?: string; extensionName?: string; npmPackages?: Array<{ name: string; typings: string }> } = {},
): Promise<string>
{
	const namespace = params.namespace ?? 'BX.Test';
	const extensionName = params.extensionName ?? 'bx.test';

	const { packageRoot, input } = createExtension(files);

	for (const pkg of params.npmPackages ?? [])
	{
		createNpmPackage({ packageRoot, pkgName: pkg.name, typings: pkg.typings });
	}

	const outputPath = path.join(tmpDir, 'dist', 'bundle.d.ts');
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });

	const emitter = new DeclarationEmitter();
	await emitter.emit({
		packageRoot,
		input,
		namespace,
		extensionName,
		outputPath,
	});

	return fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';
}

describe('DeclarationEmitter — npm types inline', () => {
	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-npm-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('should inline types from npm package used in namespace member', async () => {
		const content = await emitAndRead({
			'index.ts': `
				import type { AxiosInstance } from 'axios';

				export class HttpClient {
					client: AxiosInstance = null as any;
				}
			`,
		}, {
			extensionName: 'bx.http',
			namespace: 'BX.Http',
			npmPackages: [
				{
					name: 'axios',
					typings: 'export interface AxiosInstance { get(url: string): void; }',
				},
			],
		});

		assert.include(content, "declare module 'bx.http/internal/axios'");
		assert.include(content, 'interface AxiosInstance');
		assert.include(content, 'class HttpClient');
		assert.include(content, "import('bx.http/internal/axios').AxiosInstance");
	});

	it('should use separate internal modules per npm package', async () => {
		const content = await emitAndRead({
			'index.ts': `
				import type { Foo } from 'pkg-a';
				import type { Bar } from 'pkg-b';

				export class Service {
					a: Foo = null as any;
					b: Bar = null as any;
				}
			`,
		}, {
			extensionName: 'bx.svc',
			namespace: 'BX.Svc',
			npmPackages: [
				{ name: 'pkg-a', typings: 'export interface Foo { x: number; }' },
				{ name: 'pkg-b', typings: 'export interface Bar { y: string; }' },
			],
		});

		assert.include(content, "declare module 'bx.svc/internal/pkg-a'");
		assert.include(content, "declare module 'bx.svc/internal/pkg-b'");
		assert.include(content, "import('bx.svc/internal/pkg-a').Foo");
		assert.include(content, "import('bx.svc/internal/pkg-b').Bar");
	});

	it('should handle scoped npm packages', async () => {
		const content = await emitAndRead({
			'index.ts': `
				import type { Widget } from '@scope/foo';

				export class Container {
					widget: Widget = null as any;
				}
			`,
		}, {
			extensionName: 'bx.cont',
			namespace: 'BX.Cont',
			npmPackages: [
				{ name: '@scope/foo', typings: 'export interface Widget { id: string; }' },
			],
		});

		assert.include(content, "declare module 'bx.cont/internal/@scope/foo'");
		assert.include(content, "import('bx.cont/internal/@scope/foo').Widget");
	});

	it('should produce TypeScript-valid declarations for npm-typed namespace class', async () => {
		const content = await emitAndRead({
			'index.ts': `
				import type { AxiosInstance } from 'axios';

				export class HttpClient {
					client: AxiosInstance = null as any;
				}
			`,
		}, {
			extensionName: 'bx.http',
			namespace: 'BX.Http',
			npmPackages: [
				{ name: 'axios', typings: 'export interface AxiosInstance { get(url: string): string; }' },
			],
		});

		const dtsFile = path.join(tmpDir, 'dist', 'bundle.d.ts');
		const testFile = path.join(tmpDir, 'dist', 'validate.ts');
		fs.writeFileSync(testFile, `/// <reference path="./bundle.d.ts" />\n`
			+ `const http: BX.Http.HttpClient = new BX.Http.HttpClient();\n`
			+ `const c = http.client.get('url');\n`);

		const ts = await import('typescript');
		const program = ts.default.createProgram([testFile], {
			strict: true,
			noEmit: true,
			skipLibCheck: true,
			target: ts.default.ScriptTarget.ESNext,
			module: ts.default.ModuleKind.ESNext,
		});
		const diagnostics = program.getSemanticDiagnostics().map((d) => ts.default.flattenDiagnosticMessageText(d.messageText, '\n'));

		assert.deepEqual(diagnostics, [], `Type errors in bundle.d.ts:\n${content}\n@ ${dtsFile}`);
	});

	it('should inline transitive references (duplicated into same container)', async () => {
		const content = await emitAndRead({
			'index.ts': `
				import type { Client } from 'parent';

				export class Wrapper {
					client: Client = null as any;
				}
			`,
		}, {
			extensionName: 'bx.wrap',
			namespace: 'BX.Wrap',
			npmPackages: [
				{
					name: 'parent',
					typings: `
						import type { ChildOption } from 'child';
						export interface Client { options: ChildOption; }
					`,
				},
				{
					name: 'child',
					typings: 'export interface ChildOption { mode: string; }',
				},
			],
		});

		assert.include(content, "declare module 'bx.wrap/internal/parent'");
		assert.include(content, 'interface Client');
		assert.include(content, 'interface ChildOption');
	});
});
