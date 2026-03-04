import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BuildService } from '../../src/modules/services/build/build.service';
import { RollupBuildStrategy } from '../../src/modules/services/build/strategies/rollup.strategy';
import { BundleConfigManager } from '../../src/modules/config/bundle/bundle.config.manager';
import { PhpConfigManager } from '../../src/modules/config/php/php.config.manager';

import type { BuildOptions } from '../../src/modules/services/build/types/build.service.types';

const fixturesPath = path.join(import.meta.dirname, 'fixtures');

function cleanDist(extensionPath: string): void
{
	const distPath = path.join(extensionPath, 'dist');
	if (fs.existsSync(distPath))
	{
		fs.rmSync(distPath, { recursive: true });
	}
}

function loadBundleConfig(extensionPath: string): BundleConfigManager
{
	const config = new BundleConfigManager();
	const configPath = path.join(extensionPath, 'bundle.config.js');
	if (fs.existsSync(configPath))
	{
		config.loadFromFile(configPath);
	}
	return config;
}

function getBuildOptions(extensionPath: string, bundleConfig: BundleConfigManager): BuildOptions
{
	return {
		input: path.join(extensionPath, bundleConfig.get('input')),
		output: {
			js: path.join(extensionPath, bundleConfig.get('output').js),
			css: path.join(extensionPath, bundleConfig.get('output').css),
		},
		packageRoot: extensionPath,
		publicPath: '/test/',
		targets: [],
		namespace: bundleConfig.get('namespace'),
		typescript: false,
		concat: bundleConfig.get('concat'),
		cssImages: bundleConfig.get('cssImages'),
		resolveFiles: bundleConfig.get('resolveFilesImport'),
		minify: bundleConfig.get('minification'),
		sourceMaps: bundleConfig.get('sourceMaps'),
	};
}

describe('build', () => {
	let buildService: BuildService;

	beforeEach(() => {
		buildService = new BuildService(new RollupBuildStrategy());
	});

	describe('basic extension', () => {
		const extensionPath = path.join(fixturesPath, 'basic-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should build JS bundle', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isArray(result.errors);
			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'extension.bundle.js');
			assert.isTrue(fs.existsSync(jsOutput), 'JS bundle should exist');

			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'BasicComponent', 'Bundle should contain class name');
		});

		it('should build CSS bundle', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const content = fs.readFileSync(cssOutput, 'utf-8');
			assert.include(content, '.basic-component', 'CSS should contain class');
		});

		it('should detect main.core dependency', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isArray(result.dependencies);
			assert.include(result.dependencies, 'main.core', 'Should detect main.core import');
		});
	});

	describe('concat option', () => {
		const extensionPath = path.join(fixturesPath, 'concat-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should concatenate JS files in correct order', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'extension.bundle.js');
			assert.isTrue(fs.existsSync(jsOutput), 'JS bundle should exist');

			const content = fs.readFileSync(jsOutput, 'utf-8');

			// Check order: first.js content should come before ConcatComponent, last.js should come after
			const firstIndex = content.indexOf('LegacyFirst');
			const componentIndex = content.indexOf('ConcatComponent');
			const lastIndex = content.indexOf('LegacyLast');

			assert.isAbove(firstIndex, -1, 'LegacyFirst should be in bundle');
			assert.isAbove(componentIndex, -1, 'ConcatComponent should be in bundle');
			assert.isAbove(lastIndex, -1, 'LegacyLast should be in bundle');

			assert.isBelow(firstIndex, componentIndex, 'LegacyFirst should come before ConcatComponent');
			assert.isBelow(componentIndex, lastIndex, 'ConcatComponent should come before LegacyLast');
		});

		it('should concatenate CSS files in correct order', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const content = fs.readFileSync(cssOutput, 'utf-8');

			// Check order: reset.css should come before component styles
			const resetIndex = content.indexOf('box-sizing');
			const componentIndex = content.indexOf('.concat-component');

			assert.isAbove(resetIndex, -1, 'Reset styles should be in bundle');
			assert.isAbove(componentIndex, -1, 'Component styles should be in bundle');

			assert.isBelow(resetIndex, componentIndex, 'Reset styles should come before component styles');
		});
	});

	describe('protected option', () => {
		const extensionPath = path.join(fixturesPath, 'protected-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should have protected flag in config', () => {
			const bundleConfig = loadBundleConfig(extensionPath);

			assert.isTrue(bundleConfig.get('protected'), 'Extension should be protected');
		});

		it('should build when explicitly requested', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'extension.bundle.js');
			assert.isTrue(fs.existsSync(jsOutput), 'Protected extension should build');
		});
	});

	describe('includes filtering', () => {
		const extensionPath = path.join(fixturesPath, 'includes-extension');
		const configPhpPath = path.join(extensionPath, 'config.php');
		const originalConfig = `<?
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true)
{
	die();
}

return [
	'js' => 'dist/extension.bundle.js',
	'css' => 'dist/extension.bundle.css',
	'rel' => [
		'main.popup',
	],
	'includes' => [
		'main.core',
	],
];
`;

		beforeEach(() => {
			cleanDist(extensionPath);
			fs.writeFileSync(configPhpPath, originalConfig);
		});

		afterEach(() => {
			cleanDist(extensionPath);
			fs.writeFileSync(configPhpPath, originalConfig);
		});

		it('should not add main.core to rel when it is in includes', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const buildResult = await buildService.build(options);

			// Load PHP config and update it like BasePackage does
			const phpConfig = new PhpConfigManager();
			phpConfig.loadFromFile(configPhpPath);

			const includes = new Set<string>(phpConfig.get('includes') ?? []);
			const dependencies = buildResult.dependencies.filter(dep => !includes.has(dep));

			phpConfig.set('rel', dependencies);
			await phpConfig.save(configPhpPath, 'test.includes');

			const content = fs.readFileSync(configPhpPath, 'utf-8');

			// Parse rel array from config.php
			const relMatch = content.match(/'rel' => \[([\s\S]*?)\]/);
			assert.isNotNull(relMatch, 'rel array should exist');

			const relContent = relMatch![1];

			// main.core should NOT be in rel since it's in includes
			assert.notInclude(relContent, "'main.core'", 'main.core should not be in rel when in includes');

			// main.popup should still be detected as dependency
			assert.include(relContent, 'main.popup', 'main.popup should be in rel');
		});

		it('should not add main.polyfill.core when main.core is in includes', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const buildResult = await buildService.build(options);

			const phpConfig = new PhpConfigManager();
			phpConfig.loadFromFile(configPhpPath);

			const includes = new Set<string>(phpConfig.get('includes') ?? []);
			const dependencies = buildResult.dependencies.filter(dep => !includes.has(dep));

			phpConfig.set('rel', dependencies);
			await phpConfig.save(configPhpPath, 'test.includes');

			const content = fs.readFileSync(configPhpPath, 'utf-8');

			const relMatch = content.match(/'rel' => \[([\s\S]*?)\]/);
			const relContent = relMatch![1];

			// main.polyfill.core should NOT be added since main.core is in includes
			assert.notInclude(relContent, 'main.polyfill.core', 'main.polyfill.core should not be in rel when main.core is in includes');
		});
	});

	describe('skip_core logic', () => {
		const extensionPath = path.join(fixturesPath, 'basic-extension');
		const configPhpPath = path.join(extensionPath, 'config.php');

		beforeEach(() => {
			cleanDist(extensionPath);
			// Create basic config.php
			fs.writeFileSync(configPhpPath, `<?
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true)
{
	die();
}

return [
	'js' => 'dist/extension.bundle.js',
	'css' => 'dist/extension.bundle.css',
	'rel' => [],
];
`);
		});

		afterEach(() => {
			cleanDist(extensionPath);
			if (fs.existsSync(configPhpPath))
			{
				fs.unlinkSync(configPhpPath);
			}
		});

		it('should add skip_core=true when extension does not depend on main.core', async () => {
			// Create a simple extension without main.core dependency
			const simpleJsPath = path.join(extensionPath, 'src', 'extension.js');
			const originalContent = fs.readFileSync(simpleJsPath, 'utf-8');

			fs.writeFileSync(simpleJsPath, `
export class SimpleComponent {
	constructor() {
		this.name = 'simple';
	}
}
`);

			try
			{
				const bundleConfig = loadBundleConfig(extensionPath);
				const options = getBuildOptions(extensionPath, bundleConfig);
				const buildResult = await buildService.build(options);

				const phpConfig = new PhpConfigManager();
				phpConfig.loadFromFile(configPhpPath);
				phpConfig.set('rel', buildResult.dependencies);
				await phpConfig.save(configPhpPath, 'test.simple');

				const content = fs.readFileSync(configPhpPath, 'utf-8');

				// skip_core should be true since there's no main.core dependency
				assert.include(content, "'skip_core' => true", 'skip_core should be true when not depending on main.core');
			}
			finally
			{
				fs.writeFileSync(simpleJsPath, originalContent);
			}
		});

		it('should add skip_core=false when extension depends on main.core', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const buildResult = await buildService.build(options);

			const phpConfig = new PhpConfigManager();
			phpConfig.loadFromFile(configPhpPath);
			phpConfig.set('rel', buildResult.dependencies);
			await phpConfig.save(configPhpPath, 'test.basic');

			const content = fs.readFileSync(configPhpPath, 'utf-8');

			// skip_core should be false since there IS a main.core dependency
			assert.include(content, "'skip_core' => false", 'skip_core should be false when depending on main.core');
		});

		it('should not add skip_core for main.core extension', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const buildResult = await buildService.build(options);

			const phpConfig = new PhpConfigManager();
			phpConfig.loadFromFile(configPhpPath);
			phpConfig.set('rel', buildResult.dependencies);
			await phpConfig.save(configPhpPath, 'main.core');

			const content = fs.readFileSync(configPhpPath, 'utf-8');

			// For main.core, skip_core should not be added at all
			assert.notInclude(content, 'skip_core', 'skip_core should not be added for main.core');
		});
	});
});
