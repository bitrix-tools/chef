import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { DeclarationEmitter } from '../../src/modules/engines/build/declaration-emitter';
import { Environment } from '../../src/environment/environment';
import { PackageResolver } from '../../src/modules/packages/package-resolver';

let repoRoot: string;

function writeFile(filePath: string, content: string): void
{
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, 'utf-8');
}

function createSiblingExtension(params: {
	moduleName: string;
	extensionName: string;
	namespace: string;
	files: Record<string, string>;
}): { packageRoot: string; input: string }
{
	const { moduleName, extensionName, namespace, files } = params;
	const segments = extensionName.split('.');
	const extensionRoot = path.join(repoRoot, moduleName, 'install', 'js', ...segments);

	writeFile(
		path.join(extensionRoot, 'bundle.config.js'),
		`module.exports = { input: './src/index.ts', namespace: '${namespace}' };\n`,
	);

	for (const [rel, content] of Object.entries(files))
	{
		writeFile(path.join(extensionRoot, rel), content);
	}

	return {
		packageRoot: extensionRoot,
		input: path.join(extensionRoot, 'src', 'index.ts'),
	};
}

async function emitConsumer(
	consumer: { packageRoot: string; input: string },
	namespace: string,
	siblingPaths?: Record<string, string[]>,
): Promise<string>
{
	const outputPath = path.join(consumer.packageRoot, 'dist', 'bundle.d.ts');
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });

	const emitter = new DeclarationEmitter();
	await emitter.emit({
		packageRoot: consumer.packageRoot,
		input: consumer.input,
		namespace,
		outputPath,
		compilerOptions: siblingPaths ? { paths: siblingPaths } : undefined,
	});

	return fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';
}

describe('DeclarationEmitter — sibling extensions', () => {
	beforeEach(() => {
		repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-sibling-'));
		// Create all source-repo indicators (main, ui, crm — ALL required)
		fs.mkdirSync(path.join(repoRoot, 'main'), { recursive: true });
		fs.mkdirSync(path.join(repoRoot, 'ui'), { recursive: true });
		fs.mkdirSync(path.join(repoRoot, 'crm'), { recursive: true });
		Environment.setContext(repoRoot);
		PackageResolver.clearCache();
	});

	afterEach(() => {
		fs.rmSync(repoRoot, { recursive: true, force: true });
		PackageResolver.clearCache();
		// Restore Environment to initial cwd so other test suites aren't affected
		Environment.setContext(process.cwd());
	});

	it('should qualify references to sibling extension types in namespace member', async () => {
		createSiblingExtension({
			moduleName: 'main',
			extensionName: 'main.core',
			namespace: 'BX.Main.Core',
			files: {
				'src/index.ts': 'export class EventEmitter { emit(name: string): void {} }',
			},
		});

		const consumer = createSiblingExtension({
			moduleName: 'ui',
			extensionName: 'ui.listener',
			namespace: 'BX.UI.Listener',
			files: {
				'src/index.ts': `
					import { EventEmitter } from 'main.core';

					export class Listener {
						bus: EventEmitter = null as any;
					}
				`,
			},
		});

		const output = await emitConsumer(consumer, 'BX.UI.Listener');

		assert.include(output, 'class Listener');
		assert.include(output, 'BX.Main.Core.EventEmitter');
		assert.notMatch(output, /^\s*bus: EventEmitter$/m);
	});

	it('should qualify references to sibling extension default import', async () => {
		createSiblingExtension({
			moduleName: 'main',
			extensionName: 'main.logger',
			namespace: 'BX.Main.Logger',
			files: {
				'src/index.ts': 'export default class Logger { log(msg: string): void {} }',
			},
		});

		const consumer = createSiblingExtension({
			moduleName: 'ui',
			extensionName: 'ui.app',
			namespace: 'BX.UI.App',
			files: {
				'src/index.ts': `
					import Logger from 'main.logger';

					export class App {
						logger: Logger = null as any;
					}
				`,
			},
		});

		const output = await emitConsumer(consumer, 'BX.UI.App');

		assert.include(output, 'class App');
		assert.include(output, 'BX.Main.Logger.Logger');
	});

	it('should qualify references in top-level type alias', async () => {
		createSiblingExtension({
			moduleName: 'main',
			extensionName: 'main.core',
			namespace: 'BX.Main.Core',
			files: {
				'src/index.ts': 'export interface Token { value: string; }',
			},
		});

		const consumer = createSiblingExtension({
			moduleName: 'ui',
			extensionName: 'ui.widget',
			namespace: 'BX.UI.Widget',
			files: {
				'src/index.ts': `
					import type { Token } from 'main.core';

					export type WidgetToken = Token;
					export class Widget { token: WidgetToken = null as any; }
				`,
			},
		});

		const output = await emitConsumer(consumer, 'BX.UI.Widget');

		assert.include(output, 'type WidgetToken = BX.Main.Core.Token');
	});

	it('should NOT treat unknown extension-shaped name as sibling (package not resolvable)', async () => {
		const consumer = createSiblingExtension({
			moduleName: 'ui',
			extensionName: 'ui.orphan',
			namespace: 'BX.UI.Orphan',
			files: {
				'src/index.ts': `
					import type { Unknown } from 'nowhere.missing';

					export class Orphan { field: Unknown = null as any; }
				`,
			},
		});

		const output = await emitConsumer(consumer, 'BX.UI.Orphan');

		// Emission should not substitute with BX.Nowhere.Missing (not registered)
		assert.notInclude(output, 'BX.Nowhere.Missing');
	});

	it('should refer to a builtin type shadowed by a sibling in a parent namespace through globalThis', async () => {
		const core = createSiblingExtension({
			moduleName: 'main',
			extensionName: 'main.core',
			namespace: 'BX',
			files: {
				'src/index.ts': `
					export class Event { getData(): unknown { return null; } }
					export class Dom { static clean(): void {} }
				`,
			},
		});

		const consumer = createSiblingExtension({
			moduleName: 'ui',
			extensionName: 'ui.switcher',
			namespace: 'BX.UI',
			files: {
				'src/index.ts': `
					import { Dom } from 'main.core';

					export type SwitcherEvent = Partial<Pick<Event, 'stopPropagation' | 'target'>>;
					export class Switcher { dom: typeof Dom = Dom; }
				`,
			},
		});

		const output = await emitConsumer(consumer, 'BX.UI', { 'main.core': [core.input] });

		assert.include(output, 'Pick<globalThis.Event,');
	});

	it('should rename an internal type whose name a sibling in the same namespace declares', async () => {
		const store = createSiblingExtension({
			moduleName: 'ui',
			extensionName: 'ui.store',
			namespace: 'BX.UI.Lib',
			files: {
				'src/index.ts': `export { bookingStore } from './store';`,
				'src/store.ts': `
					class BookingStore { get(): { count: number } { return { count: 0 }; } }
					export const bookingStore: BookingStore = new BookingStore();
				`,
			},
		});

		const storeDtsPath = PackageResolver.resolve('ui.store')!.getOutputJsPath().replace(/\.js$/, '.d.ts');
		fs.mkdirSync(path.dirname(storeDtsPath), { recursive: true });
		await new DeclarationEmitter().emit({ ...store, namespace: 'BX.UI.Lib', outputPath: storeDtsPath });
		assert.include(fs.readFileSync(storeDtsPath, 'utf-8'), 'class BookingStore {');

		const consumer = createSiblingExtension({
			moduleName: 'ui',
			extensionName: 'ui.store-filter',
			namespace: 'BX.UI.Lib',
			files: {
				'src/index.ts': `
					import { bookingStore } from 'ui.store';

					type BookingStore = ReturnType<typeof bookingStore.get>;

					export class BookingFilter {
						get store(): BookingStore { return bookingStore.get(); }
					}
				`,
			},
		});

		const output = await emitConsumer(consumer, 'BX.UI.Lib', { 'ui.store': [store.input] });

		assert.match(output, /type BookingStore\$1 = /);
		assert.include(output, 'get store(): BookingStore$1;');
	});

	it('should point an inferred import type at a renamed internal type', async () => {
		const core = createSiblingExtension({
			moduleName: 'main',
			extensionName: 'main.core',
			namespace: 'BX',
			files: {
				'src/index.ts': 'export class Dom { static clean(): void {} }',
			},
		});

		const consumer = createSiblingExtension({
			moduleName: 'ui',
			extensionName: 'ui.widget',
			namespace: 'BX.UI.Widget',
			files: {
				'src/index.ts': `
					export { Widget } from './widget';
					export type { Frame } from './public-types';
				`,
				'src/public-types.ts': 'export type Frame = { id: string };',
				'src/frames.ts': `
					export type Frame = { index: number };
					export function getFrame(): Frame { return { index: 0 }; }
				`,
				'src/widget.ts': `
					import { Dom } from 'main.core';
					import { getFrame } from './frames';

					export class Widget {
						dom: typeof Dom = Dom;
						frame() { return getFrame(); }
					}
				`,
			},
		});

		const output = await emitConsumer(consumer, 'BX.UI.Widget', { 'main.core': [core.input] });

		assert.match(output, /type Frame\$1 = \{\s+index: number;/);
		assert.include(output, 'frame(): Frame$1;');
		assert.notInclude(output, 'import(');
	});
});
