import * as path from 'node:path';
import * as fs from 'node:fs';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import sinon from 'sinon';

import { BuildEngine } from '../../src/modules/engines/build/build-engine';
import { RollupBuildStrategy } from '../../src/modules/engines/build/rollup/rollup-strategy';
import { BundleConfigManager } from '../../src/modules/config/bundle/bundle-config-manager';
import { Environment } from '../../src/environment/environment';
import { PackageResolver } from '../../src/modules/packages/package-resolver';
import { standaloneStrategy } from '../../src/modules/config/bundle/strategies/standalone-strategy';

import { sourceRepo, extensionPath } from '../fixtures/index';

import type { BuildOptions, BuildCodeOptions } from '../../src/modules/engines/build/build-types';

function cleanDist(dir: string): void
{
	const distPath = path.join(dir, 'dist');
	if (fs.existsSync(distPath))
	{
		fs.rmSync(distPath, { recursive: true });
	}
}

function loadBundleConfig(dir: string): BundleConfigManager
{
	const config = new BundleConfigManager();
	const configPath = path.join(dir, 'bundle.config.js');
	if (fs.existsSync(configPath))
	{
		config.loadFromFile(configPath);
	}

	return config;
}

function getBuildOptions(dir: string, bundleConfig: BundleConfigManager, packageName?: string): BuildOptions
{
	const standalone = bundleConfig.get('standalone');

	return {
		input: path.join(dir, bundleConfig.get('input')),
		output: {
			js: path.join(dir, bundleConfig.get('output').js),
			css: path.join(dir, bundleConfig.get('output').css),
		},
		packageRoot: dir,
		publicPath: '/test/',
		targets: [],
		namespace: bundleConfig.get('namespace'),
		packageName,
		typescript: bundleConfig.get('input').endsWith('.ts'),
		standalone: standalone.enabled,
		standaloneRemap: standalone.remap,
		standaloneExposeNamespaces: standalone.exposeNamespaces,
		concat: bundleConfig.get('concat'),
		cssImages: bundleConfig.get('cssImages'),
	};
}

describe('standalone build', () => {
	let buildService: BuildEngine;
	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		PackageResolver.clearCache();
		sandbox = sinon.createSandbox();
		sandbox.stub(Environment, 'getRoot').returns(sourceRepo);
		sandbox.stub(Environment, 'getType').returns('source');
		buildService = new BuildEngine(new RollupBuildStrategy());
	});

	afterEach(() => {
		PackageResolver.clearCache();
		sandbox.restore();
	});

	describe('basic JS standalone', () => {
		const dir = extensionPath('standalone-basic');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should inline JS dependency into bundle', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.isTrue(result.standalone, 'Result should be marked as standalone');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			assert.isTrue(fs.existsSync(jsOutput), 'JS bundle should exist');

			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'StandaloneApp', 'Bundle should contain own class');
			assert.include(content, 'isReady', 'Bundle should contain inlined dependency code');
			assert.notInclude(result.dependencies, 'main.core', 'Inlined dependency should not be listed as external');
		});
	});

	describe('TS dependency inlining', () => {
		const dir = extensionPath('standalone-ts-dep');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should inline and transpile TypeScript dependency', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'App', 'Bundle should contain own class');
			assert.include(content, 'TsLib', 'Bundle should contain inlined TS class');
			assert.include(content, 'getName', 'Bundle should contain inlined TS methods');
			assert.notInclude(content, ': LibConfig', 'TS types should be stripped');
			assert.notInclude(content, 'interface', 'TS interfaces should be stripped');
		});
	});

	describe('type-only dependency', () => {
		const dir = extensionPath('standalone-type-only');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should inline protected extension that re-exports real code', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.notInclude(result.dependencies, 'ui.type-only-dep', 'Protected extension should be inlined, not external');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'Widget', 'Bundle should contain own class');
			assert.include(content, 'Form', 'Bundle should contain code re-exported through protected extension');
		});
	});

	describe('Flow dependency inlining', () => {
		const dir = extensionPath('standalone-flow-dep');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should inline Flow dependency and strip type annotations', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'Wrapper', 'Bundle should contain own TS class');
			assert.include(content, 'FlowComponent', 'Bundle should contain inlined Flow class');
			assert.include(content, 'getName', 'Bundle should contain inlined Flow methods');
			assert.notInclude(content, ': Options', 'Flow types should be stripped');
			assert.notInclude(content, ': string', 'Flow return types should be stripped');
		});
	});

	describe('remap to Bitrix extension', () => {
		const dir = extensionPath('standalone-remap');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should remap type-only dependency to a real extension and inline it', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.notInclude(result.dependencies, 'ui.type-only-dep', 'Remapped dependency should not be external');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'RemapApp', 'Bundle should contain own class');
			assert.include(content, 'Form', 'Bundle should contain inlined Form class from ui.forms');
		});
	});

	describe('remap to npm package', () => {
		const dir = extensionPath('standalone-remap-npm');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should remap type-only dependency to npm package and inline it', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.notInclude(result.dependencies, 'ui.npm-wrapper-types', 'Remapped dependency should not be external');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'Greeter', 'Bundle should contain own class');
			assert.include(content, 'Hello', 'Bundle should contain inlined npm package code');
		});
	});

	describe('JS extension with JS + TS dependencies', () => {
		const dir = extensionPath('standalone-js-mixed');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should inline both JS and TS dependencies', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'MixedApp', 'Bundle should contain own class');
			assert.include(content, 'isReady', 'Bundle should contain inlined JS dependency code');
			assert.include(content, 'TsLib', 'Bundle should contain inlined TS class');
			assert.include(content, 'getName', 'Bundle should contain inlined TS methods');
			assert.notInclude(content, ': LibConfig', 'TS types should be stripped');
			assert.notInclude(result.dependencies, 'main.core', 'JS dependency should be inlined');
			assert.notInclude(result.dependencies, 'main.ts-lib', 'TS dependency should be inlined');
		});
	});

	describe('TS extension with JS + TS dependencies', () => {
		const dir = extensionPath('standalone-ts-mixed');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should inline both JS and TS dependencies from TS source', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'MixedTsApp', 'Bundle should contain own TS class');
			assert.include(content, 'isReady', 'Bundle should contain inlined JS dependency code');
			assert.include(content, 'TsLib', 'Bundle should contain inlined TS class');
			assert.include(content, 'getName', 'Bundle should contain inlined TS methods');
			assert.notInclude(content, ': LibConfig', 'TS types from dependency should be stripped');
			assert.notInclude(content, ': boolean', 'TS types from own code should be stripped');
			assert.notInclude(result.dependencies, 'main.core', 'JS dependency should be inlined');
			assert.notInclude(result.dependencies, 'main.ts-lib', 'TS dependency should be inlined');
		});
	});

	describe('CSS from dependencies', () => {
		const dir = extensionPath('standalone-css-dep');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should collect CSS from inlined dependency into CSS bundle', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'StyledApp', 'JS bundle should contain own class');
			assert.include(content, 'isReady', 'JS bundle should contain inlined dependency code');

			const cssOutput = path.join(dir, 'dist', 'bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const cssContent = fs.readFileSync(cssOutput, 'utf-8');
			assert.include(cssContent, '.styled-app', 'CSS should contain own styles');
			assert.include(cssContent, '.core-root', 'CSS should contain styles from inlined dependency');
		});
	});

	describe('CSS from CSS-only dependency in rel', () => {
		const dir = extensionPath('standalone-css-only-dep');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should include CSS from CSS-only dependency listed in config.php rel', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig, 'ui.standalone-css-only-dep');
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'CssOnlyDepApp', 'JS bundle should contain own class');

			const cssOutput = path.join(dir, 'dist', 'bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const cssContent = fs.readFileSync(cssOutput, 'utf-8');
			assert.include(cssContent, '.css-only-dep-app', 'CSS should contain own styles');
			assert.include(cssContent, '.css-only-test', 'CSS should contain styles from CSS-only dependency');
		});
	});

	describe('glob remap to Bitrix extension', () => {
		const dir = extensionPath('standalone-remap-glob');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should remap via glob pattern and inline the target extension', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.notInclude(result.dependencies, 'ui.type-only-dep.forms', 'Remapped dependency should not be external');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'GlobRemapApp', 'Bundle should contain own class');
			assert.include(content, 'Form', 'Bundle should contain inlined Form from ui.forms');
		});
	});

	describe('glob remap to npm package', () => {
		const dir = extensionPath('standalone-remap-npm-glob');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should remap via glob pattern to npm package and inline it', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.notInclude(result.dependencies, 'ui.npm-wrapper-types.greet', 'Remapped dependency should not be external');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'NpmGlobApp', 'Bundle should contain own class');
			assert.include(content, 'Hi,', 'Bundle should contain inlined npm package code');
		});
	});

	describe('mixed remap (exact + glob)', () => {
		const dir = extensionPath('standalone-remap-mixed');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should handle exact and glob remaps in the same config', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.notInclude(result.dependencies, 'ui.type-only-dep', 'Exact-remapped dependency should not be external');
			assert.notInclude(result.dependencies, 'ui.npm-wrapper-types.greet', 'Glob-remapped dependency should not be external');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'MixedRemapApp', 'Bundle should contain own class');
			assert.include(content, 'Form', 'Bundle should contain inlined Form from exact remap');
			assert.include(content, 'Hi,', 'Bundle should contain inlined npm code from glob remap');
		});
	});

	describe('exposeNamespaces', () => {
		const dir = extensionPath('standalone-expose');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should expose inlined dependency exports to global namespace', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'ExposeApp', 'Bundle should contain own class');
			assert.include(content, 'Helper', 'Bundle should contain inlined dependency class');
			assert.include(content, 'globalThis.BX.UI.NsLib', 'Bundle should expose dependency namespace');
			assert.match(content, /globalThis\.BX\.UI\.NsLib\[k\] = v/, 'Bundle should assign exports to namespace');
		});

		it('should not expose namespaces when exposeNamespaces is not set', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			options.standaloneExposeNamespaces = false;
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'ExposeApp', 'Bundle should contain own class');
			assert.notInclude(content, 'globalThis.BX.UI.NsLib', 'Bundle should not expose namespace');
		});

		it('should not expose dependency with namespace "window"', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);

			// main.core has no namespace (defaults to 'window') — should not be exposed
			const result = await buildService.build(options);
			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.notInclude(content, 'globalThis.window', 'Should not expose "window" namespace');
		});

		it('should not expose dependency without namespace', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);
			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');

			// Count expose blocks — should only be for ui.ns-lib (BX.UI.NsLib)
			const exposeCount = (content.match(/globalThis\.BX\.UI\.NsLib\[k\] = v/g) || []).length;
			assert.equal(exposeCount, 1, 'Should expose only one dependency (ui.ns-lib)');
		});
	});

	describe('exports restoration', () => {
		const dir = extensionPath('standalone-basic');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should restore exports reference before IIFE assignments', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, '__originalExports__', 'Should save original exports reference');

			// Restoration should appear before the first exports.X assignment
			const restoreIndex = content.indexOf('exports = __originalExports__');
			const firstExport = content.indexOf('exports.StandaloneApp');
			assert.isAbove(restoreIndex, -1, 'Should restore exports');
			assert.isAbove(firstExport, -1, 'Should have export assignments');
			assert.isBelow(restoreIndex, firstExport, 'Restore should come before export assignments');
		});
	});

	describe('standalone config validation', () => {
		it('should accept boolean true', () => {
			assert.isTrue(standaloneStrategy.validate(true));
		});

		it('should accept boolean false', () => {
			assert.isTrue(standaloneStrategy.validate(false));
		});

		it('should accept object with string remap entries', () => {
			assert.isTrue(standaloneStrategy.validate({
				remap: { 'ui.a': 'ui.b' },
			}));
		});

		it('should accept object with npm remap entries', () => {
			assert.isTrue(standaloneStrategy.validate({
				remap: { 'ui.a': { npm: '@scope/pkg', from: 'ui.b' } },
			}));
		});

		it('should accept object with mixed remap entries', () => {
			assert.isTrue(standaloneStrategy.validate({
				remap: {
					'ui.a': 'ui.b',
					'ui.c.*': { npm: '@scope/*', from: 'ui.d' },
				},
			}));
		});

		it('should reject remap entry with missing npm field', () => {
			const result = standaloneStrategy.validate({
				remap: { 'ui.a': { from: 'ui.b' } },
			});
			assert.isString(result);
			assert.include(result as string, 'npm');
		});

		it('should reject remap entry with missing from field', () => {
			const result = standaloneStrategy.validate({
				remap: { 'ui.a': { npm: '@scope/pkg' } },
			});
			assert.isString(result);
			assert.include(result as string, 'from');
		});

		it('should reject remap entry with invalid type', () => {
			const result = standaloneStrategy.validate({
				remap: { 'ui.a': 123 },
			});
			assert.isString(result);
		});

		it('should reject non-object remap', () => {
			const result = standaloneStrategy.validate({ remap: 'invalid' });
			assert.isString(result);
		});

		it('should accept object with exposeNamespaces', () => {
			assert.isTrue(standaloneStrategy.validate({
				exposeNamespaces: true,
			}));
		});

		it('should reject non-boolean exposeNamespaces', () => {
			const result = standaloneStrategy.validate({
				exposeNamespaces: 'invalid',
			});
			assert.isString(result);
			assert.include(result as string, 'exposeNamespaces');
		});

		it('should reject invalid standalone value', () => {
			const result = standaloneStrategy.validate('invalid');
			assert.isString(result);
		});

		it('should prepare boolean true to enabled config', () => {
			const config = standaloneStrategy.prepare(true);
			assert.isTrue(config.enabled);
			assert.deepEqual(config.remap, {});
			assert.isFalse(config.exposeNamespaces);
		});

		it('should prepare object with remap', () => {
			const config = standaloneStrategy.prepare({
				remap: {
					'ui.a': 'ui.b',
					'ui.c': { npm: '@scope/pkg', from: 'ui.d' },
				},
			});
			assert.isTrue(config.enabled);
			assert.deepEqual(config.remap['ui.a'], 'ui.b');
			assert.deepEqual(config.remap['ui.c'], { npm: '@scope/pkg', from: 'ui.d' });
		});

		it('should prepare object with exposeNamespaces', () => {
			const config = standaloneStrategy.prepare({
				exposeNamespaces: true,
			});
			assert.isTrue(config.enabled);
			assert.isTrue(config.exposeNamespaces);
		});
	});

	describe('direct CSS-only extension import', () => {
		const dir = extensionPath('standalone-css-import');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should include CSS from directly imported CSS-only extensions', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'CssImportApp', 'JS bundle should contain own class');

			const cssOutput = path.join(dir, 'dist', 'bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const cssContent = fs.readFileSync(cssOutput, 'utf-8');
			assert.include(cssContent, '.css-import-app', 'CSS should contain own styles');
			assert.include(cssContent, '.css-only-test', 'CSS should contain styles from CSS-only extension with bundle.config');
			assert.include(cssContent, '.css-no-bundleconfig-tokens', 'CSS should contain styles from CSS-only extension without bundle.config');
			assert.include(cssContent, '.css-absolute-path-component', 'CSS should contain styles from CSS-only extension with absolute path in config.php');
		});
	});

	describe('recursive CSS-only dependencies in rel', () => {
		const dir = extensionPath('standalone-css-recursive');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should collect CSS from nested CSS-only dependency chain', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig, 'ui.standalone-css-recursive');
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const cssOutput = path.join(dir, 'dist', 'bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const cssContent = fs.readFileSync(cssOutput, 'utf-8');
			assert.include(cssContent, '.recursive-css-app', 'CSS should contain own styles');
			assert.include(cssContent, '.css-with-rel-icons', 'CSS should contain styles from direct CSS-only dependency');
			assert.include(cssContent, '.css-no-bundleconfig-tokens', 'CSS should contain styles from transitive CSS-only dependency');
		});
	});

	describe('exposeNamespaces with CSS-only dependencies', () => {
		const dir = extensionPath('standalone-expose-css');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should inject CSS deps into expose proxy and expose namespace', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'ExposeCssApp', 'JS bundle should contain own class');
			assert.include(content, 'JsWithCssRelLib', 'JS bundle should contain inlined dependency');
			assert.include(content, 'globalThis.BX.UI.JsWithCssRel', 'Bundle should expose dependency namespace');

			const cssOutput = path.join(dir, 'dist', 'bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const cssContent = fs.readFileSync(cssOutput, 'utf-8');
			assert.include(cssContent, '.expose-css-app', 'CSS should contain own styles');
			assert.include(cssContent, '.css-no-bundleconfig-tokens', 'CSS should contain styles from dependency\'s CSS-only rel');
		});
	});

	describe('CSS images from external dependency', () => {
		const dir = extensionPath('standalone-css-images');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should place external dependency images in subdirectory by extension name', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const cssOutput = path.join(dir, 'dist', 'bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const cssContent = fs.readFileSync(cssOutput, 'utf-8');
			assert.include(cssContent, '.standalone-css-images', 'CSS should contain own styles');
			assert.include(cssContent, '.css-images-dep', 'CSS should contain dependency styles');

			// External images should be placed in subdirectory by extension name
			assert.include(cssContent, 'images/ui.css-images-dep/', 'CSS URLs should reference extension subdirectory');

			// Image file should be copied to subdirectory
			const imagePath = path.join(dir, 'dist', 'images', 'ui.css-images-dep', 'icon.svg');
			assert.isTrue(fs.existsSync(imagePath), 'Image should be copied to extension subdirectory');
		});
	});

	describe('buildCode', () => {
		it('should bundle in-memory code', async () => {
			const code = `
				export class Component {
					render() { return '<div>test</div>'; }
				}
			`;

			const result = await buildService.buildCode({
				code,
				packageRoot: extensionPath('standalone-basic'),
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.BuildCode',
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.isString(result.code, 'Should return code as string');
			assert.include(result.code, 'Component', 'Code should contain class name');
		});

		it('should treat unresolved dependencies as external', async () => {
			const code = `
				import { Something } from 'nonexistent.extension';
				export const value = 42;
			`;

			const result = await buildService.buildCode({
				code,
				packageRoot: extensionPath('standalone-basic'),
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.BuildCode',
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.dependencies, 'nonexistent.extension', 'Unresolved dependency should be external');
		});

		it('should treat other extensions as external and not inline them', async () => {
			const code = `
				import { Core } from 'main.core';
				export class App {
					init() { return Core; }
				}
			`;

			const result = await buildService.buildCode({
				code,
				packageRoot: extensionPath('standalone-basic'),
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.BuildCode',
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.code, 'App', 'Code should contain own class');
			assert.include(result.dependencies, 'main.core', 'External dependency should be listed');
		});

		it('should resolve currentPackage import to its source', async () => {
			// Extension ui.js-extension exports Greeter class from src/index.js
			const code = `
				import { Greeter } from 'ui.js-extension';
				export const instance = new Greeter('hi');
			`;

			const result = await buildService.buildCode({
				code,
				packageName: 'ui.js-extension',
				packageRoot: extensionPath('js-extension'),
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.BuildCode',
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.notInclude(result.dependencies, 'ui.js-extension', 'Own package should not be external');
			assert.include(result.code, 'Greeter', 'Source of currentPackage should be inlined');
		});

		it('should return sourcemap', async () => {
			const code = `export const value = 42;`;

			const result = await buildService.buildCode({
				code,
				packageRoot: extensionPath('standalone-basic'),
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.Sourcemap',
				sourcemap: true,
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.isNotNull(result.map, 'Should return sourcemap');
			assert.isString(result.map?.mappings, 'Sourcemap should have mappings');
		});

		it('should strip Flow types from currentPackage source', async () => {
			const code = `
				import { FlowComponent } from 'ui.flow-extension';
				export const instance = new FlowComponent({ name: 'x', value: 1 });
			`;

			const result = await buildService.buildCode({
				code,
				packageName: 'ui.flow-extension',
				packageRoot: extensionPath('flow-extension'),
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.BuildCode',
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.code, 'FlowComponent', 'Flow source should be inlined');
			assert.notInclude(result.code, 'type Options', 'Flow type aliases should be stripped');
			assert.notMatch(result.code, /:\s*Options\b/, 'Flow type annotations should be stripped');
		});

		it('should strip TypeScript types from currentPackage source', async () => {
			const code = `
				import { TsLib } from 'main.ts-lib';
				export const instance = new TsLib({ name: 'x', version: 1 });
			`;

			const result = await buildService.buildCode({
				code,
				packageName: 'main.ts-lib',
				packageRoot: path.join(sourceRepo, 'main/install/js/main/ts-lib'),
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.BuildCode',
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.code, 'TsLib', 'TS source should be inlined');
			assert.notInclude(result.code, 'interface LibConfig', 'TS interfaces should be stripped');
			assert.notMatch(result.code, /:\s*LibConfig\b/, 'TS type annotations should be stripped');
		});

		it('should keep resolvable bitrix extensions external without inlining their graph', async () => {
			// Regression: with the old standalone-in-buildCode pipeline, a tested
			// package's dependency (like main.core) was resolved and inlined via
			// PackageResolver together with its rel chain. This caused
			// INVALID_EXTERNAL_ID when a nested dependency (e.g. rest.client)
			// had no src/ to resolve. Now all non-current extensions fall through
			// to UNRESOLVED_IMPORT and become external — no inlining, no conflict.
			const code = `
				import { Type } from 'main.core';
				import { BBCode } from 'ui.bbcode.model';
				export const refs = { Type, BBCode };
			`;

			const result = await buildService.buildCode({
				code,
				packageName: 'ui.js-extension',
				packageRoot: extensionPath('js-extension'),
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.BuildCode',
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.dependencies, 'main.core', 'main.core should stay external');
			assert.include(result.dependencies, 'ui.bbcode.model', 'ui.bbcode.model should stay external');
			assert.notInclude(result.code, 'class Type', 'Should not inline main.core internals');
		});
	});
});
