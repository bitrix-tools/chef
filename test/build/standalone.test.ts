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

function getBuildOptions(dir: string, bundleConfig: BundleConfigManager): BuildOptions
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
		typescript: bundleConfig.get('input').endsWith('.ts'),
		standalone: standalone.enabled,
		standaloneRemap: standalone.remap,
		concat: bundleConfig.get('concat'),
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

		it('should treat type-only extension as external', async () => {
			const bundleConfig = loadBundleConfig(dir);
			const options = getBuildOptions(dir, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.dependencies, 'ui.type-only-dep', 'Type-only extension should be listed as external dependency');

			const jsOutput = path.join(dir, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'Widget', 'Bundle should contain own class');
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

		it('should reject invalid standalone value', () => {
			const result = standaloneStrategy.validate('invalid');
			assert.isString(result);
		});

		it('should prepare boolean true to enabled config', () => {
			const config = standaloneStrategy.prepare(true);
			assert.isTrue(config.enabled);
			assert.deepEqual(config.remap, {});
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
	});

	describe('buildCode standalone', () => {
		it('should bundle code with standalone mode', async () => {
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
				namespace: 'BX.Test.Standalone',
				standalone: true,
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
				namespace: 'BX.Test.Standalone',
				standalone: true,
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.dependencies, 'nonexistent.extension', 'Unresolved dependency should be external');
		});

		it('should inline resolved JS dependency', async () => {
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
				namespace: 'BX.Test.Standalone',
				standalone: true,
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.code, 'App', 'Code should contain own class');
			assert.notInclude(result.dependencies, 'main.core', 'Inlined dependency should not be listed as external');
		});

		it('should inline and transpile TypeScript dependency from JS code', async () => {
			const code = `
				import { TsLib } from 'main.ts-lib';
				export class App {
					init() { return new TsLib({ name: 'test', version: 1 }); }
				}
			`;

			const result = await buildService.buildCode({
				code,
				packageRoot: extensionPath('standalone-basic'),
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.JsWithTsDep',
				standalone: true,
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.code, 'App', 'Code should contain own class');
			assert.include(result.code, 'TsLib', 'Code should inline TS dependency');
			assert.notInclude(result.code, ': LibConfig', 'TypeScript types should be stripped');
		});

		it('should return sourcemap in standalone mode', async () => {
			const code = `export const value = 42;`;

			const result = await buildService.buildCode({
				code,
				packageRoot: extensionPath('standalone-basic'),
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.Sourcemap',
				standalone: true,
				sourcemap: true,
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.isNotNull(result.map, 'Should return sourcemap');
			assert.isString(result.map?.mappings, 'Sourcemap should have mappings');
		});
	});
});
