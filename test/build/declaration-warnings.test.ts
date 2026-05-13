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
	compilerOptions?: import('typescript').CompilerOptions,
): Promise<{ content: string; outputPath: string; diagnostics: Awaited<ReturnType<DeclarationEmitter['emit']>> }>
{
	const outputPath = path.join(consumer.packageRoot, 'dist', 'bundle.d.ts');
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });

	const emitter = new DeclarationEmitter();
	const diagnostics = await emitter.emit({
		packageRoot: consumer.packageRoot,
		input: consumer.input,
		namespace,
		outputPath,
		compilerOptions,
	});

	const content = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';

	return { content, outputPath, diagnostics };
}

/**
 * Build `tsconfig.paths` mapping sibling extension names to their `src/index.ts`.
 * The inlined-sibling detector walks the sibling's source file via `tsconfigPaths`,
 * so tests that exercise it must pass these paths to `emit()`.
 */
function buildSiblingPaths(siblings: Array<{ extensionName: string; moduleName: string }>): Record<string, string[]>
{
	const result: Record<string, string[]> = {};
	for (const { extensionName, moduleName } of siblings)
	{
		const segments = extensionName.split('.');
		const srcPath = path.join(repoRoot, moduleName, 'install', 'js', ...segments, 'src', 'index.ts');
		result[extensionName] = [srcPath];
	}

	return result;
}

describe('DeclarationEmitter — warnings & diagnostics', () => {
	beforeEach(() => {
		repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-dts-warnings-'));
		fs.mkdirSync(path.join(repoRoot, 'main'), { recursive: true });
		fs.mkdirSync(path.join(repoRoot, 'ui'), { recursive: true });
		fs.mkdirSync(path.join(repoRoot, 'crm'), { recursive: true });
		Environment.setContext(repoRoot);
		PackageResolver.clearCache();
	});

	afterEach(() => {
		fs.rmSync(repoRoot, { recursive: true, force: true });
		PackageResolver.clearCache();
		Environment.setContext(process.cwd());
	});

	describe('isolatedDeclarations override', () => {
		it('should emit declaration even when user tsconfig forces isolatedDeclarations', async () => {
			const consumer = createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.iso',
				namespace: 'BX.UI.Iso',
				files: {
					// `prop: () => something` would normally trigger TS9007 under
					// isolatedDeclarations, blocking emit for the whole file.
					'src/index.ts': `
						const Outline = { LINK: 'o-link', HOME: 'o-home' } as const;

						export const props = {
							prop: () => Outline,
						};

						export class IconClass {
							name: string = 'icon';
						}
					`,
				},
			});

			const { content } = await emitConsumer(consumer, 'BX.UI.Iso', {
				isolatedDeclarations: true,
			});

			// Both declarations must be present despite isolatedDeclarations being on in tsconfig.
			assert.include(content, 'class IconClass');
			assert.include(content, 'const props');
		});
	});

	describe('destructured exports deduplication', () => {
		it('should render `export const { a, b, c } = X` only once, not N times', async () => {
			const consumer = createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.destruct',
				namespace: 'BX.UI.Destruct',
				files: {
					'src/index.ts': `
						const source = {
							alpha: 1,
							beta: 'two',
							gamma: true,
							delta: [1, 2, 3],
						};

						export const { alpha, beta, gamma, delta } = source;
					`,
				},
			});

			const { content } = await emitConsumer(consumer, 'BX.UI.Destruct');

			// All four names must be present somewhere
			assert.match(content, /\balpha\b/);
			assert.match(content, /\bbeta\b/);
			assert.match(content, /\bgamma\b/);
			assert.match(content, /\bdelta\b/);

			// But "alpha:" (the start of the destructured const) should appear at most once
			const alphaMatches = content.match(/alpha:/g) ?? [];
			assert.equal(
				alphaMatches.length,
				1,
				`Destructured statement should appear once in d.ts, got ${alphaMatches.length} occurrences:\n${content}`,
			);
		});
	});

	describe('inlined sibling type detector', () => {
		function createSiblingWithIcons(): void
		{
			createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.icons',
				namespace: 'BX.UI.Icons',
				files: {
					'src/index.ts': `
						export const Outline = {
							HOME: 'o-home',
							USER: 'o-user',
							SETTINGS: 'o-settings',
							PROFILE: 'o-profile',
							SEARCH: 'o-search',
						} as const;

						export class Renderer {
							size: number = 16;
						}
					`,
				},
			});
		}

		it('should warn on inlined anonymous sibling shape', async () => {
			createSiblingWithIcons();

			const consumer = createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.consumer',
				namespace: 'BX.UI.Consumer',
				files: {
					'src/index.ts': `
						import { Outline } from 'ui.icons';

						// No annotation — Outline shape inlines into d.ts
						export const helper = {
							getIcons: () => Outline,
						};
					`,
				},
			});

			const { diagnostics } = await emitConsumer(consumer, 'BX.UI.Consumer', {
				paths: buildSiblingPaths([{ extensionName: 'ui.icons', moduleName: 'ui' }]),
			});

			const inlineWarnings = diagnostics.filter((d) => d.severity === 'warning' && d.code === 0);
			assert.isAtLeast(inlineWarnings.length, 1, `Expected inline warning, got ${JSON.stringify(diagnostics)}`);
			const warning = inlineWarnings[0];
			const message = warning.message;
			const details = warning.details ?? '';
			assert.include(message, 'Outline');
			assert.include(message, 'ui.icons');
			assert.include(details, 'typeof Outline');

			// Long-form details now carry the docs link.
			assert.include(details, 'https://bitrix-tools.github.io/chef/guide/dts-inlining');
			assert.match(warning.file ?? '', /\.ts$/, 'Diagnostic should point at the original .ts source, not the emitted .d.ts');
			assert.isNumber(warning.line, 'Diagnostic should carry a source line number');
			assert.isNumber(warning.column, 'Diagnostic should carry a source column number');
		});

		it('should produce a vue-components fix recipe for `components: { X }`', async () => {
			// Mirrors the real-world Vue idiom: `defineComponent({ components: { BIcon } })`.
			// Source-side classification must pick the `vue-components` kind and the message
			// must show the exact `as { BIcon: typeof BIcon }` replacement.
			createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.icons-vue',
				namespace: 'BX.UI.IconsVue',
				files: {
					'src/index.ts': `
						export const BIcon = {
							props: { name: { type: String, required: true } },
							template: '<i />',
						};
					`,
				},
			});

			const consumer = createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.vue-consumer',
				namespace: 'BX.UI.VueConsumer',
				files: {
					'src/index.ts': `
						import { BIcon } from 'ui.icons-vue';

						function defineComponent<T>(options: T): T { return options; }

						export const MyButton = defineComponent({
							name: 'MyButton',
							components: { BIcon },
						});
					`,
				},
			});

			const { diagnostics } = await emitConsumer(consumer, 'BX.UI.VueConsumer', {
				paths: buildSiblingPaths([{ extensionName: 'ui.icons-vue', moduleName: 'ui' }]),
			});

			const inlineWarnings = diagnostics.filter((d) => d.severity === 'warning' && d.code === 0);
			assert.isAtLeast(inlineWarnings.length, 1, `Expected inline warning, got ${JSON.stringify(diagnostics)}`);
			const details = inlineWarnings[0].details ?? '';
			assert.include(details, 'components: { BIcon } as { BIcon: typeof BIcon }');
			assert.include(details, 'Fix: pin the type on the `components` map');
		});

		it('should warn on inlined named class from sibling', async () => {
			createSiblingWithIcons();

			const consumer = createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.named',
				namespace: 'BX.UI.Named',
				files: {
					'src/index.ts': `
						import { Renderer } from 'ui.icons';

						export function makeShape() {
							return { renderer: new Renderer() };
						}
					`,
				},
			});

			const { diagnostics, content } = await emitConsumer(consumer, 'BX.UI.Named');

			// The named class match is a direct symbol match — but TS will still write
			// `Renderer` which we then qualify. The detector targets anonymous shapes;
			// for named ones the existing sibling-qualification path already handles them.
			// We just verify the consumer's d.ts qualifies the reference, no false warning.
			assert.notMatch(
				content,
				/\bsize:\s*number;\s*}/,
				'Named class should not be inlined as anonymous shape',
			);
			const inlineWarnings = diagnostics.filter((d) => d.severity === 'warning' && d.code === 0);
			assert.equal(
				inlineWarnings.length,
				0,
				`Named class reference should be qualified, not flagged. Got: ${JSON.stringify(inlineWarnings)}`,
			);
		});

		it('should not warn when annotation keeps the reference', async () => {
			createSiblingWithIcons();

			const consumer = createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.annotated',
				namespace: 'BX.UI.Annotated',
				files: {
					'src/index.ts': `
						import { Outline } from 'ui.icons';

						export function getOutline(): typeof Outline {
							return Outline;
						}
					`,
				},
			});

			const { diagnostics } = await emitConsumer(consumer, 'BX.UI.Annotated');

			const inlineWarnings = diagnostics.filter((d) => d.severity === 'warning' && d.code === 0);
			assert.equal(inlineWarnings.length, 0, `No warning expected, got: ${JSON.stringify(inlineWarnings)}`);
		});

		it('should not warn for unrelated extension without sibling imports', async () => {
			createSiblingWithIcons();

			const consumer = createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.standalone',
				namespace: 'BX.UI.Standalone',
				files: {
					'src/index.ts': `
						export class Standalone {
							value: string = 'hello';
						}
					`,
				},
			});

			const { diagnostics } = await emitConsumer(consumer, 'BX.UI.Standalone');

			const inlineWarnings = diagnostics.filter((d) => d.severity === 'warning' && d.code === 0);
			assert.equal(
				inlineWarnings.length,
				0,
				`Standalone extension should not produce inline warnings: ${JSON.stringify(inlineWarnings)}`,
			);
		});

		it('should detect inline through transitive `export * from` in sibling', async () => {
			// Inner sibling exporting Outline shape
			createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.icons.core',
				namespace: 'BX.UI.IconsCore',
				files: {
					'src/index.ts': `
						export const Outline = {
							ARROW_LEFT: 'arrow-left',
							ARROW_RIGHT: 'arrow-right',
							ARROW_UP: 'arrow-up',
							ARROW_DOWN: 'arrow-down',
						} as const;
					`,
				},
			});

			// Re-export sibling — only `export * from` to inner
			createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.icons.facade',
				namespace: 'BX.UI.IconsFacade',
				files: {
					'src/index.ts': `
						export * from 'ui.icons.core';
					`,
				},
			});

			const consumer = createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.transitive',
				namespace: 'BX.UI.Transitive',
				files: {
					'src/index.ts': `
						import { Outline } from 'ui.icons.facade';

						export const helper = {
							icons: () => Outline,
						};
					`,
				},
			});

			const { diagnostics } = await emitConsumer(consumer, 'BX.UI.Transitive', {
				paths: buildSiblingPaths([
					{ extensionName: 'ui.icons.facade', moduleName: 'ui' },
					{ extensionName: 'ui.icons.core', moduleName: 'ui' },
				]),
			});

			const inlineWarnings = diagnostics.filter((d) => d.severity === 'warning' && d.code === 0);
			assert.isAtLeast(
				inlineWarnings.length,
				1,
				`Expected transitive inline warning, got: ${JSON.stringify(diagnostics)}`,
			);
			assert.include(inlineWarnings[0].message, 'Outline');
		});

		it('should ignore structurally empty sibling exports (Object.freeze({} as const))', async () => {
			// Mirrors `ui.icon-set.api.core` `Special = Object.freeze({} as const)` which used
			// to flood every Vue component's `DefineComponent<..., {}, {}, ...>` with phantom
			// "inlines the shape of Special" warnings via mutual assignability.
			createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.empty',
				namespace: 'BX.UI.Empty',
				files: {
					'src/index.ts': `
						export const Special = Object.freeze({} as const);
						export const Outline = {
							HOME: 'o-home',
						} as const;
					`,
				},
			});

			const consumer = createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.empty-consumer',
				namespace: 'BX.UI.EmptyConsumer',
				files: {
					'src/index.ts': `
						import { Outline } from 'ui.empty';

						export const noise: { a: {}; b: {}; c: Readonly<{}> } = {
							a: {},
							b: {},
							c: Object.freeze({}),
						};

						export function getOutline(): typeof Outline {
							return Outline;
						}
					`,
				},
			});

			const { diagnostics } = await emitConsumer(consumer, 'BX.UI.EmptyConsumer', {
				paths: buildSiblingPaths([{ extensionName: 'ui.empty', moduleName: 'ui' }]),
			});

			const inlineWarnings = diagnostics.filter((d) => d.severity === 'warning' && d.code === 0);
			assert.equal(
				inlineWarnings.length,
				0,
				`Empty sibling exports must not match arbitrary {} shapes. Got: ${JSON.stringify(inlineWarnings)}`,
			);
		});
	});

	describe('stale d.ts cleanup', () => {
		it('should remove the previous d.ts when no bundle is produced', async () => {
			const consumer = createSiblingExtension({
				moduleName: 'ui',
				extensionName: 'ui.stale',
				namespace: 'BX.UI.Stale',
				files: {
					'src/index.ts': 'export class Old {}',
				},
			});

			const first = await emitConsumer(consumer, 'BX.UI.Stale');
			assert.isTrue(fs.existsSync(first.outputPath), 'first build should produce d.ts');
			assert.include(first.content, 'class Old');

			// Replace src with a file that has no exports — bundler returns null
			fs.writeFileSync(consumer.input, 'const _internal = 1;\n', 'utf-8');

			const second = await emitConsumer(consumer, 'BX.UI.Stale');
			assert.isFalse(
				fs.existsSync(second.outputPath),
				'stale d.ts should be removed when no new bundle is produced',
			);
		});
	});
});
