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

	async function emitStoreAndFilter(storeIndex: string): Promise<{ storeDts: string; output: string }>
	{
		const store = createSiblingExtension({
			moduleName: 'ui',
			extensionName: 'ui.store',
			namespace: 'BX.UI.Lib',
			files: {
				'src/index.ts': storeIndex,
				'src/store.ts': `
					export class BookingStore { get(): { count: number } { return { count: 0 }; } }
					export const bookingStore: BookingStore = new BookingStore();
				`,
			},
		});

		const storeDtsPath = PackageResolver.resolve('ui.store')!.getOutputJsPath().replace(/\.js$/, '.d.ts');
		fs.mkdirSync(path.dirname(storeDtsPath), { recursive: true });
		await new DeclarationEmitter().emit({ ...store, namespace: 'BX.UI.Lib', outputPath: storeDtsPath });

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

		return { storeDts: fs.readFileSync(storeDtsPath, 'utf-8'), output };
	}

	it('should rename an internal type whose name a sibling in the same namespace declares', async () => {
		const { storeDts, output } = await emitStoreAndFilter(`export { bookingStore, BookingStore } from './store';`);

		assert.include(storeDts, '\texport class BookingStore {');
		assert.match(output, /type BookingStore\$1 = /);
		assert.include(output, 'get store(): BookingStore$1;');
	});

	it('should keep the name of an internal type when a sibling uses it internally', async () => {
		const { storeDts, output } = await emitStoreAndFilter(`export { bookingStore } from './store';`);

		assert.include(storeDts, '\n\tclass BookingStore {');
		assert.match(output, /\n\ttype BookingStore = /);
		assert.include(output, 'get store(): BookingStore;');
	});

	it('should rename an internal type whose name an enclosing namespace declares', async () => {
		const core = createSiblingExtension({
			moduleName: 'main',
			extensionName: 'main.core',
			namespace: 'BX',
			files: {
				'src/index.ts': 'export class Type { static isString(value: unknown): boolean { return false; } }',
			},
		});

		const consumer = createSiblingExtension({
			moduleName: 'ui',
			extensionName: 'ui.widget',
			namespace: 'BX.UI.Widget',
			files: {
				'src/index.ts': `
					import { Type as CoreType } from 'main.core';

					type Type = 'primary' | 'secondary';

					export class Widget {
						type: Type = 'primary';
						core: typeof CoreType = CoreType;
					}
				`,
			},
		});

		const output = await emitConsumer(consumer, 'BX.UI.Widget', { 'main.core': [core.input] });

		assert.include(output, "\n\ttype Type$1 = 'primary' | 'secondary';");
		assert.include(output, 'type: Type$1;');
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
	/**
	 * `ui.buttons` exports a class and a class used as a set of constants; `ui.vue-button`, written
	 * in JavaScript, passes both on, so the types of the consumer reach `ui.buttons` through its sources.
	 */
	async function emitThroughJavaScriptSibling(buttonsEntryAlias: string): Promise<string>
	{
		const buttons = createSiblingExtension({
			moduleName: 'ui',
			extensionName: 'ui.buttons',
			namespace: 'BX.UI',
			files: {
				'src/index.ts': `
					import AirButtonStyle from './air-button-style';
					import Button from './button';
					export { AirButtonStyle, Button };
				`,
				'src/air-button-style.ts': `
					export default class AirButtonStyle {
						static FILLED = 'filled' as const;
						static OUTLINE = 'outline' as const;
					}
				`,
				'src/button.ts': 'export default class Button { render(): void {} }',
			},
		});

		const component = createSiblingExtension({
			moduleName: 'ui',
			extensionName: 'ui.vue-button',
			namespace: 'BX.UI.VueButton',
			files: {
				'src/index.js': `
					import { AirButtonStyle, Button } from 'ui.buttons';
					export const ButtonComponent = {
						data() { return { AirButtonStyle }; },
						create() { return new Button(); },
					};
				`,
			},
		});

		const consumer = createSiblingExtension({
			moduleName: 'disk',
			extensionName: 'disk.header',
			namespace: 'BX.Disk',
			files: {
				'src/index.ts': `
					import { ButtonComponent } from 'ui.vue-button';
					export const Header = { components: { ButtonComponent } };
				`,
			},
		});

		const outputPath = path.join(consumer.packageRoot, 'dist', 'bundle.d.ts');
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		await new DeclarationEmitter().emit({
			packageRoot: consumer.packageRoot,
			input: consumer.input,
			namespace: 'BX.Disk',
			outputPath,
			compilerOptions: {
				allowJs: true,
				paths: {
					'ui.buttons': [path.join(path.dirname(buttons.input), buttonsEntryAlias)],
					'ui.vue-button': [path.join(path.dirname(component.input), 'index.js')],
				},
			},
		});

		return fs.readFileSync(outputPath, 'utf-8');
	}

	it('should keep typeof of a sibling value reached through another sibling', async () => {
		const output = await emitThroughJavaScriptSibling('index.ts');

		assert.include(output, 'AirButtonStyle: typeof BX.UI.AirButtonStyle;');
		assert.include(output, 'create(): BX.UI.Button;');
		assert.notInclude(output, 'import(');
	});

	it('should find a TypeScript sibling whose alias still points at a JavaScript entry', async () => {
		const output = await emitThroughJavaScriptSibling('index.js');

		assert.include(output, 'AirButtonStyle: typeof BX.UI.AirButtonStyle;');
		assert.include(output, 'create(): BX.UI.Button;');
		assert.notInclude(output, 'import(');
	});
});
