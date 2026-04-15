import * as path from 'node:path';
import * as fs from 'node:fs';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { BuildEngine } from '../../src/modules/engines/build/build-engine';
import { RollupBuildStrategy } from '../../src/modules/engines/build/rollup/rollup-strategy';
import { BundleConfigManager } from '../../src/modules/config/bundle/bundle-config-manager';
import { PhpConfigManager } from '../../src/modules/config/php/php-config-manager';
import { DeclarationEmitter } from '../../src/modules/engines/build/declaration-emitter';
import { transformIifeLine } from '../../src/modules/engines/build/rollup/plugins/safe-namespaces';
import { transformClassesStrategy } from '../../src/modules/config/bundle/strategies/transform-classes-strategy';

import type { BuildOptions } from '../../src/modules/engines/build/build-types';

const fixturesPath = path.resolve(import.meta.dirname, '../fixtures/source-repo/ui/install/js/ui');

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
		safeNamespaces: bundleConfig.get('safeNamespaces'),
	};
}

describe('build', () => {
	let buildService: BuildEngine;

	beforeEach(() => {
		buildService = new BuildEngine(new RollupBuildStrategy());
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

	describe('js extension', () => {
		const extensionPath = path.join(fixturesPath, 'js-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should build JS bundle without errors', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.isEmpty(result.warnings, 'Should have no warnings');

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			assert.isTrue(fs.existsSync(jsOutput), 'JS bundle should exist');

			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'Greeter', 'Bundle should contain class name');
			assert.include(content, 'formatName', 'Bundle should contain imported function');
		});

		it('should inline local module imports', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');

			assert.include(content, 'charAt', 'Inlined function body should be in bundle');
			assert.notInclude(content, "from './utils.js'", 'Local imports should be resolved');
		});

		it('should have no external dependencies', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.dependencies, 'Should have no external dependencies');
		});
	});

	describe('js with CSS', () => {
		const extensionPath = path.join(fixturesPath, 'js-with-css');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should build both JS and CSS bundles', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			assert.isTrue(fs.existsSync(jsOutput), 'JS bundle should exist');

			const jsContent = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(jsContent, 'Panel', 'JS bundle should contain class name');

			const cssOutput = path.join(extensionPath, 'dist', 'bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const cssContent = fs.readFileSync(cssOutput, 'utf-8');
			assert.include(cssContent, '.js-panel', 'CSS should contain class');
		});

		it('should not include CSS import in JS output', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.notInclude(content, "import './styles.css'", 'CSS import should be stripped from JS');
			assert.notInclude(content, '.js-panel', 'CSS content should not leak into JS');
		});

		it('should report bundle sizes', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isArray(result.bundles);
			assert.isAbove(result.bundles.length, 0, 'Should have bundle info');

			for (const bundle of result.bundles)
			{
				assert.isString(bundle.fileName);
				assert.isAbove(bundle.size, 0, `${bundle.fileName} should have size > 0`);
			}
		});
	});

	describe('typescript extension', () => {
		const extensionPath = path.join(fixturesPath, 'ts-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should build TypeScript bundle', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			assert.isTrue(fs.existsSync(jsOutput), 'JS bundle should exist');

			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'UserService', 'Bundle should contain class name');
			assert.include(content, 'findByName', 'Bundle should contain method name');
		});

		it('should strip type annotations from output', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.notInclude(content, ': User', 'Type annotations should be stripped');
			assert.notInclude(content, 'interface', 'Interfaces should be stripped');
		});
	});

	describe('typescript with CSS', () => {
		const extensionPath = path.join(fixturesPath, 'ts-with-css');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should build both JS and CSS bundles', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			assert.isTrue(fs.existsSync(jsOutput), 'JS bundle should exist');

			const jsContent = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(jsContent, 'Widget', 'JS bundle should contain class name');

			const cssOutput = path.join(extensionPath, 'dist', 'bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const cssContent = fs.readFileSync(cssOutput, 'utf-8');
			assert.include(cssContent, '.ts-widget', 'CSS should contain class');
		});
	});

	describe('strip comments', () => {
		const extensionPath = path.join(fixturesPath, 'ts-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should remove comments from bundle output', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.notInclude(content, 'Service for managing users', 'JSDoc comments should be stripped from bundle');
			assert.notInclude(content, 'Adds a user', 'JSDoc comments should be stripped from bundle');
		});

		it('should preserve eslint-disable banner', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			await buildService.build(options);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, '/* eslint-disable */', 'eslint-disable banner should be preserved');
		});
	});

	describe('emit declaration', () => {
		const extensionPath = path.join(fixturesPath, 'ts-extension');
		const inputPath = path.join(extensionPath, 'src', 'index.ts');
		const namespace = 'BX.Test.Users';
		let emitter: DeclarationEmitter;
		let dtsOutput: string;

		beforeEach(() => {
			cleanDist(extensionPath);
			fs.mkdirSync(path.join(extensionPath, 'dist'), { recursive: true });
			emitter = new DeclarationEmitter();
			dtsOutput = path.join(extensionPath, 'dist', 'bundle.d.ts');
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		async function emitAndRead(): Promise<string>
		{
			await emitter.emit({
				packageRoot: extensionPath,
				input: inputPath,
				namespace,
				outputPath: dtsOutput,
			});

			return fs.readFileSync(dtsOutput, 'utf-8');
		}

		it('should generate .d.ts with namespace declaration', async () => {
			const content = await emitAndRead();

			assert.include(content, 'declare namespace BX.Test.Users');
			assert.include(content, 'class UserService');
			assert.include(content, 'findByName');
			assert.include(content, 'get count(): number');
			assert.notInclude(content, '#private');
		});

		it('should preserve JSDoc comments on interfaces and classes', async () => {
			const content = await emitAndRead();

			assert.include(content, 'Service for managing users');
			assert.include(content, 'Represents a user in the system');
			assert.include(content, 'Result of a user search operation');
		});

		it('should not generate .d.ts for window namespace', async () => {
			await emitter.emit({
				packageRoot: extensionPath,
				input: inputPath,
				namespace: 'window',
				outputPath: dtsOutput,
			});

			assert.isFalse(fs.existsSync(dtsOutput));
		});

		it('should resolve export type * re-exports', async () => {
			const content = await emitAndRead();

			assert.include(content, 'type SortOrder');
			assert.include(content, 'type FilterOptions');
			assert.include(content, 'interface Identifiable');
		});

		it('should include default-exported classes re-exported via export { ... }', async () => {
			const content = await emitAndRead();

			assert.include(content, 'class BaseEvent');
			assert.include(content, 'class EventEmitter');
		});

		it('should include dependency types referenced in signatures', async () => {
			const content = await emitAndRead();

			// EventCallback is used in EventEmitter.subscribe(eventName, listener: EventCallback)
			assert.include(content, 'EventCallback');
		});

		it('should not include private imports unused in public signatures', async () => {
			const content = await emitAndRead();

			// formatName is imported but not exported — it should not appear
			assert.notInclude(content, 'formatName');
		});

		it('should place types and interfaces outside the namespace', async () => {
			const content = await emitAndRead();
			const namespaceStart = content.indexOf('declare namespace');

			// type aliases and interfaces should appear before the namespace
			assert.isBelow(content.indexOf('type SortOrder'), namespaceStart);
			assert.isBelow(content.indexOf('type FilterOptions'), namespaceStart);
			assert.isBelow(content.indexOf('interface Identifiable'), namespaceStart);

			// exported interfaces should be outside the namespace
			assert.isBelow(content.indexOf('interface User'), namespaceStart);
			assert.isBelow(content.indexOf('interface SearchResult'), namespaceStart);

			// classes should be inside
			assert.isAbove(content.indexOf('class UserService'), namespaceStart);
			assert.isAbove(content.indexOf('class BaseEvent'), namespaceStart);
		});

		it('should place JSDoc-annotated interfaces outside the namespace', async () => {
			const content = await emitAndRead();
			const namespaceStart = content.indexOf('declare namespace');

			// Interfaces with JSDoc should still be placed outside, not inside namespace
			const userInterface = content.indexOf('interface User');
			const searchInterface = content.indexOf('interface SearchResult');

			assert.isAbove(userInterface, -1, 'User interface should exist');
			assert.isAbove(searchInterface, -1, 'SearchResult interface should exist');
			assert.isBelow(userInterface, namespaceStart, 'JSDoc-annotated User interface should be outside namespace');
			assert.isBelow(searchInterface, namespaceStart, 'JSDoc-annotated SearchResult interface should be outside namespace');
		});

		it('should resolve cross-references between top-level interfaces', async () => {
			const content = await emitAndRead();

			// SearchResult references User — both are top-level, so User should NOT be qualified
			const searchResultBlock = content.slice(
				content.indexOf('interface SearchResult'),
				content.indexOf('}', content.indexOf('interface SearchResult')) + 1,
			);
			assert.include(searchResultBlock, 'User | null', 'SearchResult should reference User without namespace prefix');
			assert.notInclude(searchResultBlock, 'BX.Test.Users.User', 'User should not be namespace-qualified in top-level type');
		});

		it('should produce valid TypeScript declarations', async () => {
			const content = await emitAndRead();

			// Write a test file that references the generated declarations
			const testFile = path.join(extensionPath, 'dist', 'validate.ts');
			fs.writeFileSync(testFile, [
				`/// <reference path="./bundle.d.ts" />`,
				``,
				`// Verify namespace members`,
				`const svc: BX.Test.Users.UserService = new BX.Test.Users.UserService();`,
				`const em: BX.Test.Users.EventEmitter = new BX.Test.Users.EventEmitter();`,
				`const evt: BX.Test.Users.BaseEvent = new BX.Test.Users.BaseEvent('test');`,
				``,
				`// Verify top-level types`,
				`const order: SortOrder = 'asc';`,
				`const opts: FilterOptions = { query: 'test', limit: 10 };`,
				`const item: Identifiable = { id: 1 };`,
				``,
				`// Verify exported interfaces with JSDoc (should be top-level, not in namespace)`,
				`const user: User = { name: 'John', age: 30 };`,
				`const result: SearchResult = { user, found: true };`,
				``,
				`// Verify class methods reference top-level types correctly`,
				`const searchResult: SearchResult = svc.findByName('test');`,
			].join('\n'), 'utf-8');

			const ts = await import('typescript');
			const program = ts.default.createProgram([testFile], {
				strict: true,
				noEmit: true,
				skipLibCheck: true,
				target: ts.default.ScriptTarget.ESNext,
				module: ts.default.ModuleKind.ESNext,
			});

			const diagnostics = program.getSemanticDiagnostics();
			const errors = diagnostics.map((d) => ts.default.flattenDiagnosticMessageText(d.messageText, '\n'));

			assert.deepEqual(errors, [], `Generated .d.ts has type errors:\n${content}`);
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

	describe('css autoprefixer', () => {
		const extensionPath = path.join(fixturesPath, 'css-autoprefixer');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should add vendor prefixes for old targets', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.targets = ['chrome 49', 'safari 9'];
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const content = fs.readFileSync(cssOutput, 'utf-8');
			assert.include(content, '-webkit-user-select', 'Should add -webkit-user-select prefix');
			assert.include(content, '-webkit-backdrop-filter', 'Should add -webkit-backdrop-filter prefix');
			assert.include(content, '-webkit-appearance', 'Should add -webkit-appearance prefix');
		});

		it('should not add unnecessary prefixes for modern targets', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.targets = ['chrome 130'];
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');
			assert.notInclude(content, '-webkit-user-select', 'Should not add prefix for modern Chrome');
		});
	});

	describe('JS targets transpilation', () => {
		const extensionPath = path.join(fixturesPath, 'js-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should keep private fields for modern targets', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.targets = ['chrome 117'];
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, '#prefix', 'Private fields should remain native for modern targets');
		});

		it('should transpile private fields for old targets', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.targets = ['chrome 70'];
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.notInclude(content, '#prefix', 'Private fields should be transpiled for old targets');
		});
	});

	describe('TypeScript targets transpilation', () => {
		const extensionPath = path.join(fixturesPath, 'ts-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should keep private fields for modern targets', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			options.targets = ['chrome 117'];
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, '#users', 'Private fields should remain native for modern targets');
		});

		it('should transpile private fields for old targets', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			options.targets = ['chrome 70'];
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.notInclude(content, '#users', 'Private fields should be transpiled for old targets');
			assert.notInclude(content, '#emitter', 'Private fields should be transpiled for old targets');
			assert.include(content, 'UserService', 'Class name should be preserved');
		});
	});

	describe('transformClasses', () => {
		const extensionPath = path.join(fixturesPath, 'ts-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should transform all classes when true', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			options.targets = ['chrome 117'];
			options.transformClasses = true;
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.notInclude(content, 'class UserService', 'UserService should be transpiled');
			assert.notInclude(content, 'class EventEmitter', 'EventEmitter should be transpiled');
			assert.notInclude(content, 'class BaseEvent', 'BaseEvent should be transpiled');
			assert.include(content, 'babelHelpers.classCallCheck', 'Should use babel class helpers');
		});

		it('should transform only specified classes', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			options.targets = ['chrome 117'];
			options.transformClasses = ['EventEmitter', 'BaseEvent'];
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'class UserService', 'UserService should remain native');
			assert.notInclude(content, 'class EventEmitter', 'EventEmitter should be transpiled');
			assert.notInclude(content, 'class BaseEvent', 'BaseEvent should be transpiled');
			assert.include(content, 'babelHelpers.classCallCheck', 'Should use babel class helpers');
		});

		it('should not transform classes when false', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			options.targets = ['chrome 117'];
			options.transformClasses = false;
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'class UserService', 'UserService should remain native');
			assert.include(content, 'class EventEmitter', 'EventEmitter should remain native');
			assert.include(content, 'class BaseEvent', 'BaseEvent should remain native');
			assert.notInclude(content, 'babelHelpers.classCallCheck', 'Should not use babel class helpers');
		});

		describe('config strategy', () => {
			it('should accept boolean true', () => {
				assert.isTrue(transformClassesStrategy.validate(true));
				assert.equal(transformClassesStrategy.prepare(true), true);
			});

			it('should accept boolean false', () => {
				assert.isTrue(transformClassesStrategy.validate(false));
				assert.equal(transformClassesStrategy.prepare(false), false);
			});

			it('should accept array of class names', () => {
				const value = ['EventEmitter', 'BaseEvent'];
				assert.isTrue(transformClassesStrategy.validate(value));
				assert.deepEqual(transformClassesStrategy.prepare(value), value);
			});

			it('should reject non-string arrays', () => {
				assert.notEqual(transformClassesStrategy.validate([1, 2]), true);
				assert.equal(transformClassesStrategy.prepare([1, 2]), false);
			});

			it('should reject objects', () => {
				assert.notEqual(transformClassesStrategy.validate({ classes: ['A'] }), true);
				assert.equal(transformClassesStrategy.prepare({ classes: ['A'] }), false);
			});

			it('should default to false', () => {
				assert.equal(transformClassesStrategy.getDefault(), false);
			});
		});
	});

	describe('css images', () => {
		const extensionPath = path.join(fixturesPath, 'css-images');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should inline small images as data URI', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const content = fs.readFileSync(cssOutput, 'utf-8');
			assert.include(content, 'data:', 'Small image should be inlined as data URI');
			assert.notInclude(content, 'small.png', 'Should not contain original filename');
		});
	});

	describe('css images advanced', () => {
		const extensionPath = path.join(fixturesPath, 'css-images-advanced');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should not inline images exceeding maxSize', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const cssOutput = path.join(extensionPath, 'dist', 'bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			// large.png (1175 bytes) > maxSize (1KB) — should keep original URL
			assert.include(content, 'large.png', 'Large image should keep original filename');
		});

		it('should inline small images as base64', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			// small.png (69 bytes) < maxSize (1KB) — should be inlined
			assert.match(content, /url\("data:image\/png;base64,/, 'Small image should be inlined as base64');
			assert.notMatch(content, /url\([^)]*small\.png/, 'Small image filename should be replaced');
		});

		it('should inline SVG without base64', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			// SVG should use UTF-8 encoding, not base64
			assert.include(content, 'data:image/svg+xml;charset=utf-8,', 'SVG should be inlined as UTF-8 data URI');
			assert.notMatch(content, /url\([^)]*icon\.svg/, 'SVG filename should be replaced');
		});

		it('should not modify external URLs', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			assert.include(content, 'https://example.com/image.png', 'External URLs should not be modified');
		});

		it('should not modify existing data URIs', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			assert.include(content, 'data:image/png;base64,iVBOR', 'Existing data URIs should be preserved');
		});

		it('should copy large images to dist', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const copiedImage = path.join(extensionPath, 'dist', 'images', 'large.png');
			assert.isTrue(fs.existsSync(copiedImage), 'Large image should be copied to dist');

			const original = fs.readFileSync(path.join(extensionPath, 'src', 'images', 'large.png'));
			const copied = fs.readFileSync(copiedImage);
			assert.isTrue(original.equals(copied), 'Copied image should match original');
		});

		it('should handle query parameters in image URLs', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			assert.include(content, 'large.png?v2', 'Query parameter should be preserved in URL');

			const copiedImage = path.join(extensionPath, 'dist', 'images', 'large.png');
			assert.isTrue(fs.existsSync(copiedImage), 'Image with query param should still be copied');
		});

		it('should inline small images with query parameters', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			assert.notMatch(content, /small\.png\?v=3/, 'Small image with query should be inlined, not kept as URL');
		});

		it('should handle hash fragments in image URLs', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			assert.include(content, 'large.png#section', 'Hash fragment should be preserved in URL');
		});

		it('should not copy small images to dist', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const smallImage = path.join(extensionPath, 'dist', 'images', 'small.png');
			assert.isFalse(fs.existsSync(smallImage), 'Small images should be inlined, not copied');
		});
	});

	describe('css images complex structure', () => {
		const extensionPath = path.join(fixturesPath, 'css-images-complex');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should copy images preserving directory structure relative to src', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const expectedFiles = [
				'images/shared/icons/logo.png',
				'images/components/header/header-bg.png',
				'images/components/list/list-bg.png',
				'images/components/list/item/empty.png',
				'images/components/list/item/item-icon.png',
				'images/banner.png',
			];

			for (const file of expectedFiles)
			{
				const filePath = path.join(extensionPath, 'dist', file);
				assert.isTrue(fs.existsSync(filePath), `${file} should be copied to dist`);
			}
		});

		it('should rewrite CSS urls to point to copied files relative to output CSS', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			// All urls should point to files relative to dist/ under images/
			assert.include(content, 'url("images/shared/icons/logo.png")', 'Root CSS should reference shared icon');
			assert.include(content, 'url("images/components/header/header-bg.png")', 'Header CSS should reference header bg');
			assert.include(content, 'url("images/components/list/list-bg.png")', 'List CSS should reference list bg');
			assert.include(content, 'url("images/components/list/item/empty.png")', 'List CSS should reference item empty');
			assert.include(content, 'url("images/components/list/item/item-icon.png")', 'Item CSS should reference item icon');
			assert.include(content, 'url("images/banner.png")', 'Header CSS should reference banner from images/');
		});

		it('should not duplicate images/ prefix for files already in images/ directory', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			// src/images/banner.png → strip src/ → images/banner.png → already starts with images/ → no dup
			const correct = path.join(extensionPath, 'dist', 'images', 'banner.png');
			const wrong = path.join(extensionPath, 'dist', 'images', 'images', 'banner.png');

			assert.isTrue(fs.existsSync(correct), 'Image from images/ should be at dist/images/banner.png');
			assert.isFalse(fs.existsSync(wrong), 'Should not have double images/ prefix');
		});

		it('should preserve query parameters in rewritten URLs', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			assert.include(content, 'header-bg.png?v=2', 'Query parameters should be preserved');
		});

		it('should deduplicate shared images referenced from multiple CSS files', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			// logo.png is referenced from main.css, header.css, and item.css
			// It should be copied only once
			const logoPath = path.join(extensionPath, 'dist', 'images', 'shared', 'icons', 'logo.png');
			assert.isTrue(fs.existsSync(logoPath), 'Shared logo should exist');

			const original = fs.readFileSync(path.join(extensionPath, 'src', 'shared', 'icons', 'logo.png'));
			const copied = fs.readFileSync(logoPath);
			assert.isTrue(original.equals(copied), 'Copied image should match original');
		});

		it('should skip nonexistent files in url() without errors', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			// Nonexistent file should keep original url() unchanged
			assert.include(content, 'nonexistent.png', 'Missing file URL should remain unchanged');
		});

		it('should not modify external URLs and data URIs', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			assert.include(content, 'https://example.com/logo.png', 'External URLs should not be modified');
			assert.include(content, 'data:image/png;base64,iVBOR', 'Data URIs should not be modified');
		});

		it('should not leave images outside dist directory', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const distFiles = fs.readdirSync(path.join(extensionPath, 'dist'), { recursive: true });
			const imageFiles = (distFiles as string[]).filter((f) => f.endsWith('.png'));

			// All images should be inside dist/
			for (const file of imageFiles)
			{
				assert.isFalse(file.startsWith('..'), `Image ${file} should not escape dist directory`);
			}
		});
	});

	describe('js image import', () => {
		const extensionPath = path.join(fixturesPath, 'js-image-import');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should replace image import with URL path', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');

			assert.include(content, 'Icon', 'Bundle should contain class name');
			assert.include(content, 'assets/icon.svg', 'Import should be replaced with asset URL');
			assert.notInclude(content, "from './images/icon.svg'", 'Original import should be resolved');
		});

		it('should emit image file to assets directory', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const assetsDir = path.join(extensionPath, 'dist', 'assets');
			assert.isTrue(fs.existsSync(assetsDir), 'Assets directory should exist');

			const assets = fs.readdirSync(assetsDir);
			const svgFile = assets.find(f => f.endsWith('.svg'));
			assert.isDefined(svgFile, 'SVG file should be copied to assets');
		});
	});

	describe('css multiple files', () => {
		const extensionPath = path.join(fixturesPath, 'css-multiple');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should merge multiple CSS imports into one bundle', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const content = fs.readFileSync(cssOutput, 'utf-8');
			assert.include(content, '.multi-base', 'Should contain base styles');
			assert.include(content, '.multi-theme', 'Should contain theme styles');
		});

		it('should preserve import order in CSS bundle', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			const baseIndex = content.indexOf('.multi-base');
			const themeIndex = content.indexOf('.multi-theme');

			assert.isAbove(baseIndex, -1, 'Base styles should be in bundle');
			assert.isAbove(themeIndex, -1, 'Theme styles should be in bundle');
			assert.isBelow(baseIndex, themeIndex, 'Base styles should come before theme styles');
		});
	});

	describe('css nested components', () => {
		const extensionPath = path.join(fixturesPath, 'css-nested-components');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should collect CSS from all nested components into one bundle', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			assert.isTrue(fs.existsSync(cssOutput), 'CSS bundle should exist');

			const content = fs.readFileSync(cssOutput, 'utf-8');

			// Root component
			assert.include(content, '.app', 'Should contain root app styles');
			// Top-level components
			assert.include(content, '.header', 'Should contain header styles');
			assert.include(content, '.sidebar', 'Should contain sidebar styles');
			// Nested component
			assert.include(content, '.content', 'Should contain content styles');
			// Deeply nested components
			assert.include(content, '.card', 'Should contain card styles');
			assert.include(content, '.list', 'Should contain list styles');
			assert.include(content, '.list-item', 'Should contain list-item styles');
		});

		it('should produce a single CSS file from nested imports', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const distPath = path.join(extensionPath, 'dist');
			const cssFiles = fs.readdirSync(distPath).filter((f) => f.endsWith('.css'));

			assert.lengthOf(cssFiles, 1, 'Should produce exactly one CSS file');
		});

		it('should preserve import order: parent CSS before children', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'extension.bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			// extension.css is imported first in extension.js → should appear before component styles
			const appIndex = content.indexOf('.app');
			const headerIndex = content.indexOf('.header');
			const sidebarIndex = content.indexOf('.sidebar');
			const contentIndex = content.indexOf('.content');
			const cardIndex = content.indexOf('.card');
			const listIndex = content.indexOf('.list {');

			assert.isBelow(appIndex, headerIndex, 'App styles should come before header');
			assert.isBelow(headerIndex, sidebarIndex, 'Header should come before sidebar');
			assert.isBelow(sidebarIndex, contentIndex, 'Sidebar should come before content');

			// content.js imports content.css first, then card and list
			assert.isBelow(contentIndex, cardIndex, 'Content styles should come before card');
			assert.isBelow(cardIndex, listIndex, 'Card styles should come before list');
		});
	});

	describe('css order', () => {
		const extensionPath = path.join(fixturesPath, 'css-order');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should place own CSS before dependency CSS at every level', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const cssOutput = path.join(extensionPath, 'dist', 'app.bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			const appIndex = content.indexOf('.app');
			const widgetIndex = content.indexOf('.widget');
			const panelIndex = content.indexOf('.panel');

			// app.css is entry's own CSS → first
			assert.isBelow(appIndex, widgetIndex, 'Entry CSS (app) should come before dependency CSS (widget)');
			// widget.css is widget's own CSS → before panel.css (widget's dependency)
			assert.isBelow(widgetIndex, panelIndex, 'Widget CSS should come before its dependency CSS (panel)');
		});

		it('should place entry CSS first even when imported after JS dependencies', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const cssOutput = path.join(extensionPath, 'dist', 'app.bundle.css');
			const content = fs.readFileSync(cssOutput, 'utf-8');

			const appIndex = content.indexOf('.app');
			const panelIndex = content.indexOf('.panel');

			// app.css is imported last in app.js (after widget.js which pulls panel.css)
			// but it's entry's own CSS, so it should still appear first
			assert.isBelow(appIndex, panelIndex, 'Entry CSS should come before any dependency CSS');
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

	describe('flow extension', () => {
		const extensionPath = path.join(fixturesPath, 'flow-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should strip Flow type annotations from output', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'FlowComponent', 'Bundle should contain class name');
			assert.notInclude(content, ': Options', 'Flow type annotations should be stripped');
			assert.notInclude(content, ': string', 'Flow return types should be stripped');
			assert.notInclude(content, ': number', 'Flow return types should be stripped');
		});
	});

	describe('typescript with dependency', () => {
		const extensionPath = path.join(fixturesPath, 'ts-with-dependency');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should build TypeScript extension with external dependency', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.dependencies, 'main.core', 'Should detect main.core dependency');

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'TsComponent', 'Bundle should contain class name');
		});

		it('should treat Bitrix dependency as external IIFE parameter', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			await buildService.build(options);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.match(content, /function\s*\(exports,\s*main_core\)/, 'External dependency should be an IIFE parameter');
		});
	});

	describe('multiple dependencies', () => {
		const extensionPath = path.join(fixturesPath, 'multiple-dependencies');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should detect all Bitrix dependencies', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.dependencies, 'main.core', 'Should detect main.core');
			assert.include(result.dependencies, 'main.popup', 'Should detect main.popup');
			assert.include(result.dependencies, 'ui.design-tokens', 'Should detect ui.design-tokens');
		});

		it('should sort dependencies alphabetically', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			const sorted = [...result.dependencies].sort();
			assert.deepEqual(result.dependencies, sorted, 'Dependencies should be sorted');
		});
	});

	describe('namespace wrapping', () => {
		const extensionPath = path.join(fixturesPath, 'namespace-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should wrap output in IIFE format', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, '(function (exports)', 'Output should be wrapped in IIFE');
		});

		it('should initialize namespace path on global object', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'this.BX', 'Should initialize BX namespace');
			assert.include(content, 'BX.Test', 'Should initialize Test sub-namespace');
		});

		it('should export classes and functions to namespace', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'exports.NamespaceComponent', 'Should export class');
			assert.include(content, 'exports.createComponent', 'Should export function');
		});

		it('should add eslint-disable banner', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			await buildService.build(options);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.isTrue(content.startsWith('/* eslint-disable */'), 'Bundle should start with eslint-disable');
		});
	});

	describe('safe namespaces', () => {
		const extensionPath = path.join(fixturesPath, 'safe-namespaces');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should keep own namespace unchanged', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');

			assert.include(content, 'this.BX.Test.Namespace = this.BX.Test.Namespace || {}',
				'Own namespace should stay unchanged — it is already safe from bundle init');
		});

		it('should apply optional chaining to single dependency', () => {
			const line = '})(this.BX.Test.Namespace = this.BX.Test.Namespace || {}, BX.Main.Core);';
			const result = transformIifeLine(line);

			assert.strictEqual(result,
				'})(this.BX.Test.Namespace = this.BX.Test.Namespace || {}, BX?.Main?.Core??{});');
		});

		it('should apply optional chaining to multiple dependencies', () => {
			const line = '})(this.BX.Messenger.v2.List = this.BX.Messenger.v2.List || {}, BX.Main.Core, BX.UI.Buttons);';
			const result = transformIifeLine(line);

			assert.strictEqual(result,
				'})(this.BX.Messenger.v2.List = this.BX.Messenger.v2.List || {}, BX?.Main?.Core??{}, BX?.UI?.Buttons??{});');
		});

		it('should not add extra closing paren for no-dependency bundle', () => {
			const line = '})(this.BX.Test.Namespace = this.BX.Test.Namespace || {});';
			const result = transformIifeLine(line);

			assert.strictEqual(result,
				'})(this.BX.Test.Namespace = this.BX.Test.Namespace || {});');
		});

		it('should handle deeply nested namespace with single dependency', () => {
			const line = '})(this.BX.Messenger.v2.Const = this.BX.Messenger.v2.Const || {}, BX.OpenLines.v2.Const);';
			const result = transformIifeLine(line);

			assert.strictEqual(result,
				'})(this.BX.Messenger.v2.Const = this.BX.Messenger.v2.Const || {}, BX?.OpenLines?.v2?.Const??{});');
		});

		it('should return null for non-IIFE lines', () => {
			assert.isNull(transformIifeLine('const x = 1;'));
			assert.isNull(transformIifeLine(''));
			assert.isNull(transformIifeLine('})(window);'));
		});

		it('should not use optional chaining when disabled', async () => {
			const bundleConfig = loadBundleConfig(path.join(fixturesPath, 'namespace-extension'));
			const options = getBuildOptions(path.join(fixturesPath, 'namespace-extension'), bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(fixturesPath, 'namespace-extension', 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');

			assert.include(content, '|| {}', 'Should use standard fallback without safeNamespaces');
			assert.notInclude(content, '?.', 'Should not contain optional chaining');
		});
	});

	describe('namespace fallback for externals', () => {
		const extensionPath = path.join(fixturesPath, 'namespace-with-externals');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should use fallback namespace for unresolved external dependencies', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);
			assert.include(result.dependencies, 'main.core');
			assert.include(result.dependencies, 'rest.client');

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');

			// Find the IIFE closing line with globals
			const iifeClosing = content.split('\n').find((line) => line.startsWith('})(this.'));
			assert.isString(iifeClosing, 'Should have IIFE closing line');

			// Globals should not contain Rollup auto-generated names like rest_client
			assert.notInclude(iifeClosing!, 'rest_client',
				'Should not use Rollup auto-generated global name');
			assert.notInclude(iifeClosing!, 'main_core',
				'Should not use Rollup auto-generated global name');
		});
	});

	describe('minification', () => {
		const extensionPath = path.join(fixturesPath, 'minify-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should produce smaller output when minified', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);

			// Build without minification
			const normalResult = await buildService.build(options);
			assert.isEmpty(normalResult.errors);
			const normalOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const normalContent = fs.readFileSync(normalOutput, 'utf-8');

			cleanDist(extensionPath);

			// Build with minification
			options.minify = true;
			const minifiedResult = await buildService.build(options);
			assert.isEmpty(minifiedResult.errors);
			const minifiedContent = fs.readFileSync(normalOutput, 'utf-8');

			assert.isBelow(minifiedContent.length, normalContent.length, 'Minified output should be smaller');
		});

		it('should shorten variable names when minified', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.minify = true;
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.notInclude(content, 'firstNumber', 'Parameter names should be shortened');
			assert.notInclude(content, 'secondNumber', 'Parameter names should be shortened');
		});
	});

	describe('sourcemaps', () => {
		const extensionPath = path.join(fixturesPath, 'sourcemap-extension');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should generate sourcemap file when enabled', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.sourceMaps = true;
			const result = await buildService.build(options);

			assert.isEmpty(result.errors);

			const mapOutput = path.join(extensionPath, 'dist', 'bundle.js.map');
			assert.isTrue(fs.existsSync(mapOutput), 'Sourcemap file should exist');

			const mapContent = JSON.parse(fs.readFileSync(mapOutput, 'utf-8'));
			assert.isArray(mapContent.sources, 'Sourcemap should contain sources');
			assert.isString(mapContent.mappings, 'Sourcemap should contain mappings');
		});

		it('should add sourceMappingURL to bundle', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.sourceMaps = true;
			await buildService.build(options);

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, '//# sourceMappingURL=bundle.js.map', 'Bundle should reference sourcemap');
		});

		it('should not generate sourcemap when disabled', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.sourceMaps = false;
			await buildService.build(options);

			const mapOutput = path.join(extensionPath, 'dist', 'bundle.js.map');
			assert.isFalse(fs.existsSync(mapOutput), 'Sourcemap file should not exist');

			const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.notInclude(content, 'sourceMappingURL', 'Bundle should not reference sourcemap');
		});
	});

	describe('generate (without writing)', () => {
		it('should return build result without writing bundle files', async () => {
			const extensionPath = path.join(fixturesPath, 'js-extension');
			cleanDist(extensionPath);

			try
			{
				const bundleConfig = loadBundleConfig(extensionPath);
				const options = getBuildOptions(extensionPath, bundleConfig);
				const result = await buildService.generate(options);

				assert.isEmpty(result.errors, 'Should have no errors');
				assert.isArray(result.bundles, 'Should have bundles info');
				assert.isAbove(result.bundles.length, 0, 'Should have at least one bundle');

				const jsOutput = path.join(extensionPath, 'dist', 'bundle.js');
				assert.isFalse(fs.existsSync(jsOutput), 'JS bundle file should not be created');
			}
			finally
			{
				cleanDist(extensionPath);
			}
		});

		it('should detect dependencies same as build', async () => {
			const extensionPath = path.join(fixturesPath, 'basic-extension');
			cleanDist(extensionPath);

			try
			{
				const bundleConfig = loadBundleConfig(extensionPath);
				const options = getBuildOptions(extensionPath, bundleConfig);
				const result = await buildService.generate(options);

				assert.include(result.dependencies, 'main.core', 'Generate should detect dependencies');
			}
			finally
			{
				cleanDist(extensionPath);
			}
		});
	});

	describe('buildCode (in-memory)', () => {
		it('should return bundled code as string', async () => {
			const extensionPath = path.join(fixturesPath, 'js-extension');
			const code = `
				export class InMemoryComponent {
					greet() { return 'hello'; }
				}
			`;

			const result = await buildService.buildCode({
				code,
				packageRoot: extensionPath,
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.BuildCode',
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.isString(result.code, 'Should return code as string');
			assert.include(result.code, 'InMemoryComponent', 'Code should contain class name');
		});

		it('should detect external Bitrix dependencies', async () => {
			const extensionPath = path.join(fixturesPath, 'js-extension');
			const code = `
				import { Tag } from 'main.core';
				export class Component {
					render() { return Tag.render\`<div>test</div>\`; }
				}
			`;

			const result = await buildService.buildCode({
				code,
				packageRoot: extensionPath,
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.BuildCode',
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.dependencies, 'main.core', 'Should detect main.core dependency');
		});

		it('should return sourcemap when enabled', async () => {
			const extensionPath = path.join(fixturesPath, 'js-extension');
			const code = `export const value = 42;`;

			const result = await buildService.buildCode({
				code,
				packageRoot: extensionPath,
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.BuildCode',
				sourcemap: true,
			});

			assert.isEmpty(result.errors);
			assert.isNotNull(result.map, 'Should return sourcemap');
			assert.isString(result.map?.mappings, 'Sourcemap should have mappings');
		});
	});

	describe('error diagnostics', () => {
		it('should return CF1002 for syntax errors', async () => {
			const extensionPath = path.join(fixturesPath, 'syntax-error-inline');
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isNotEmpty(result.errors, 'Should have errors');
			assert.equal(result.errors[0].code, 'CF1002', 'Should be CF1002 syntax error');
		});

		it('should return CF1001 for TypeScript type errors', async () => {
			const extensionPath = path.join(fixturesPath, 'ts-type-error');
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			options.typescript = true;
			const result = await buildService.build(options);

			assert.isNotEmpty(result.errors, 'Should have errors');
			assert.equal(result.errors[0].code, 'CF1001', 'Should be CF1001 TypeScript error');
			assert.include(result.errors[0].message, 'TS', 'Should contain TS error code in message');
		});

		it('should return CF1006 for circular dependencies', async () => {
			const extensionPath = path.join(fixturesPath, 'circular-dependency');

			cleanDist(extensionPath);

			try
			{
				const bundleConfig = loadBundleConfig(extensionPath);
				const options = getBuildOptions(extensionPath, bundleConfig);
				const result = await buildService.build(options);

				assert.isNotEmpty(result.warnings, 'Should have warnings');

				const circularWarning = result.warnings.find(w => w.code === 'CF1006');
				assert.isDefined(circularWarning, 'Should have CF1006 circular dependency warning');
			}
			finally
			{
				cleanDist(extensionPath);
			}
		});

		it('should return CF1007 for missing exports', async () => {
			const extensionPath = path.join(fixturesPath, 'missing-export');

			cleanDist(extensionPath);

			try
			{
				const bundleConfig = loadBundleConfig(extensionPath);
				const options = getBuildOptions(extensionPath, bundleConfig);
				const result = await buildService.build(options);

				assert.isNotEmpty(result.errors, 'Should have errors');

				const missingExport = result.errors.find(e => e.code === 'CF1007');
				assert.isDefined(missingExport, 'Should have CF1007 missing export error');
				assert.include(missingExport!.message, 'nonExistent', 'Should mention the missing export name');
			}
			finally
			{
				cleanDist(extensionPath);
			}
		});

		it('should return CF1002 for CSS syntax errors', async () => {
			const extensionPath = path.join(fixturesPath, 'css-syntax-error');

			cleanDist(extensionPath);

			try
			{
				const bundleConfig = loadBundleConfig(extensionPath);
				const options = getBuildOptions(extensionPath, bundleConfig);
				options.targets = ['chrome 49'];
				const result = await buildService.build(options);

				assert.isNotEmpty(result.errors, 'Should have errors');
				assert.equal(result.errors[0].code, 'CF1002', 'Should be CF1002 syntax error');
				assert.include(result.errors[0].message, 'Unclosed block', 'Should mention CSS parse error');
			}
			finally
			{
				cleanDist(extensionPath);
			}
		});

		it('should return CF1014 for missing concat CSS files', async () => {
			const extensionPath = path.join(fixturesPath, 'concat-css-missing');

			cleanDist(extensionPath);

			try
			{
				const bundleConfig = loadBundleConfig(extensionPath);
				const options = getBuildOptions(extensionPath, bundleConfig);
				const result = await buildService.build(options);

				assert.isNotEmpty(result.warnings, 'Should have warnings');

				const concatWarning = result.warnings.find(w => w.code === 'CF1014');
				assert.isDefined(concatWarning, 'Should have CF1014 plugin warning');
				assert.include(concatWarning!.message, 'nonexistent.css', 'Should mention missing file');
			}
			finally
			{
				cleanDist(extensionPath);
			}
		});

		it('should return CF1014 for missing concat JS files', async () => {
			const extensionPath = path.join(fixturesPath, 'concat-js-missing');

			cleanDist(extensionPath);

			try
			{
				const bundleConfig = loadBundleConfig(extensionPath);
				const options = getBuildOptions(extensionPath, bundleConfig);
				const result = await buildService.build(options);

				assert.isNotEmpty(result.warnings, 'Should have warnings');

				const concatWarning = result.warnings.find(w => w.code === 'CF1014');
				assert.isDefined(concatWarning, 'Should have CF1014 plugin warning');
				assert.include(concatWarning!.message, 'nonexistent.js', 'Should mention missing file');
			}
			finally
			{
				cleanDist(extensionPath);
			}
		});
	});

	describe('side-effect imports', () => {
		const extensionPath = path.join(fixturesPath, 'side-effects');

		beforeEach(() => {
			cleanDist(extensionPath);
		});

		afterEach(() => {
			cleanDist(extensionPath);
		});

		it('should preserve side-effect-only imports in bundle', async () => {
			const bundleConfig = loadBundleConfig(extensionPath);
			const options = getBuildOptions(extensionPath, bundleConfig);
			const result = await buildService.build(options);

			assert.isEmpty(result.errors, 'Should have no errors');

			const jsOutput = path.join(extensionPath, 'dist', 'app.bundle.js');
			assert.isTrue(fs.existsSync(jsOutput), 'JS bundle should exist');

			const content = fs.readFileSync(jsOutput, 'utf-8');
			assert.include(content, 'GreetingHandler', 'Side-effect import should be preserved');
			assert.include(content, 'registerHandler', 'Registration call should be preserved');
		});
	});
});
