import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { DeclarationEmitter } from '../../src/modules/engines/build/declaration-emitter';
import type { DeclarationMode } from '../../src/modules/engines/build/declaration/declaration-printer';

let tmpDir: string;

function writeFile(filePath: string, content: string): void
{
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, 'utf-8');
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

async function emitWithMode(
	files: Record<string, string>,
	mode: DeclarationMode,
	params: { extensionName?: string; namespace?: string; moduleName?: string } = {},
): Promise<string>
{
	const extensionName = params.extensionName ?? 'ui.widget';
	const namespace = params.namespace ?? 'BX.UI.Widget';
	const moduleName = params.moduleName ?? extensionName;

	const { packageRoot, input } = createExtension(files);
	const outputPath = path.join(tmpDir, 'dist', 'bundle.d.ts');
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });

	const emitter = new DeclarationEmitter();
	await emitter.emit({
		packageRoot,
		input,
		namespace,
		extensionName,
		outputPath,
		mode,
		moduleName,
	});

	return fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';
}

describe('DeclarationEmitter — declaration modes', () => {
	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-modes-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	describe('ambient mode (default)', () => {
		it('should produce declare namespace with top-level types outside', async () => {
			const content = await emitWithMode({
				'index.ts': `
					export type Mode = 'light' | 'dark';
					export class Widget {
						mode: Mode = 'light';
					}
				`,
			}, 'ambient');

			assert.include(content, 'declare namespace BX.UI.Widget');
			assert.include(content, 'type Mode');
			assert.notInclude(content, "declare module 'ui.widget'");

			const typeIdx = content.indexOf('type Mode');
			const nsIdx = content.indexOf('declare namespace');
			assert.isBelow(typeIdx, nsIdx, 'top-level types should come before namespace block');
		});
	});

	describe('module mode', () => {
		it('should produce declare module with all exports inside', async () => {
			const content = await emitWithMode({
				'index.ts': `
					export type Mode = 'light' | 'dark';
					export class Widget {
						mode: Mode = 'light';
					}
				`,
			}, 'module');

			assert.include(content, "declare module 'ui.widget'");
			assert.notInclude(content, 'declare namespace');
			assert.include(content, 'export class Widget');
			assert.include(content, 'export type Mode');
		});

		it('should not qualify top-level type references in module mode', async () => {
			const content = await emitWithMode({
				'index.ts': `
					import Emitter from './emitter';
					export { Emitter };
					export type Options = { target: Emitter };
				`,
				'emitter.ts': `
					export default class Emitter { emit(): void {} }
				`,
			}, 'module');

			// in module mode, `Options.target: Emitter` should stay as-is (same module scope)
			assert.include(content, "declare module 'ui.widget'");
			assert.match(content, /target:\s*Emitter/);
			assert.notInclude(content, 'BX.UI.Widget.Emitter');
		});
	});

	describe('both mode', () => {
		it('should produce both namespace and module declarations', async () => {
			const content = await emitWithMode({
				'index.ts': `
					export class Widget {
						render(): string { return ''; }
					}
				`,
			}, 'both');

			assert.include(content, 'declare namespace BX.UI.Widget');
			assert.include(content, "declare module 'ui.widget'");
			assert.match(content, /class Widget\s*\{[^}]*render\(\): string;/s);
		});

		it('should put top-level types outside for ambient and inside for module', async () => {
			const content = await emitWithMode({
				'index.ts': `
					export type Mode = 'light' | 'dark';
					export class Widget {
						mode: Mode = 'light';
					}
				`,
			}, 'both');

			// ambient: type outside, widget inside namespace
			assert.include(content, 'declare namespace BX.UI.Widget');
			// module: both inside
			assert.include(content, "declare module 'ui.widget'");

			const matches = content.match(/type Mode/g);
			assert.isAtLeast(matches?.length ?? 0, 2, 'Mode should appear in both ambient top-level and module');
		});

		it('should produce TypeScript-valid declarations for both modes', async () => {
			const content = await emitWithMode({
				'index.ts': `
					export type Status = 'on' | 'off';
					export class Toggle {
						status: Status = 'off';
					}
				`,
			}, 'both');

			const dtsFile = path.join(tmpDir, 'dist', 'bundle.d.ts');
			const testFile = path.join(tmpDir, 'dist', 'validate.ts');
			fs.writeFileSync(
				testFile,
				`/// <reference path="./bundle.d.ts" />\n`
				+ `const t1: BX.UI.Widget.Toggle = new BX.UI.Widget.Toggle();\n`
				+ `const s1: Status = 'on';\n`
				+ `t1.status = s1;\n`,
			);

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
	});
});
