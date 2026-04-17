import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { runChef, sourceRepo } from './run-chef';
import { expectedPath } from '../fixtures/index';

function createTmpSourceRepo(): string
{
	const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-build-')));
	fs.cpSync(sourceRepo, tmp, { recursive: true });
	return tmp;
}

function cleanDist(tmpRepo: string, fixtureName: string): string
{
	const extDir = path.join(tmpRepo, 'ui/install/js/ui', fixtureName);
	const distPath = path.join(extDir, 'dist');
	if (fs.existsSync(distPath))
	{
		fs.rmSync(distPath, { recursive: true });
	}
	return extDir;
}

function assertBundleMatchesExpected(extensionDir: string, fixtureName: string, bundleFile: string): void
{
	const actual = fs.readFileSync(path.join(extensionDir, 'dist', bundleFile), 'utf-8');
	const expected = fs.readFileSync(path.join(expectedPath, fixtureName, bundleFile), 'utf-8');

	assert.equal(actual, expected, `Bundle ${fixtureName}/${bundleFile} differs from expected`);
}

function buildFixture(tmpRepo: string, fixtureName: string): { dest: string; extPath: string }
{
	const extPath = `ui/install/js/ui/${fixtureName}`;
	const dest = cleanDist(tmpRepo, fixtureName);
	return { dest, extPath };
}

describe('chef build', () => {
	let tmpRepo: string;

	beforeEach(() => {
		tmpRepo = createTmpSourceRepo();
	});

	afterEach(() => {
		fs.rmSync(tmpRepo, { recursive: true, force: true });
	});

	// region: basic commands

	it('should build an extension by name', async () => {
		const extensionDist = path.join(tmpRepo, 'ui/install/js/ui/buttons/dist');
		fs.rmSync(extensionDist, { recursive: true, force: true });

		const { exitCode } = await runChef(['build', 'ui.buttons'], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assert.isTrue(fs.existsSync(path.join(extensionDist, 'buttons.bundle.js')));
	});

	it('should build by --path', async () => {
		const extensionDist = path.join(tmpRepo, 'ui/install/js/ui/buttons/dist');
		fs.rmSync(extensionDist, { recursive: true, force: true });

		const { exitCode } = await runChef(
			['build', '--path', 'ui/install/js/ui/buttons'],
			{ cwd: tmpRepo },
		);

		assert.equal(exitCode, 0);
		assert.isTrue(fs.existsSync(path.join(extensionDist, 'buttons.bundle.js')));
	});

	it('should report not found for non-existent extension', async () => {
		const { output } = await runChef(['build', 'ui.does-not-exist'], { cwd: tmpRepo });

		assert.include(output, 'not found');
	});

	// endregion

	// region: JavaScript

	it('should build plain JS extension', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'js-extension');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'js-extension', 'bundle.js');
	});

	it('should build JS extension with CSS', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'js-with-css');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'js-with-css', 'bundle.js');
		assertBundleMatchesExpected(dest, 'js-with-css', 'bundle.css');
	});

	it('should build basic extension with JS and CSS', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'basic-extension');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'basic-extension', 'extension.bundle.js');
		assertBundleMatchesExpected(dest, 'basic-extension', 'extension.bundle.css');
	});

	// endregion

	// region: TypeScript

	it('should build TypeScript extension', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'ts-extension');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'ts-extension', 'bundle.js');
	});

	it('should build TypeScript extension with CSS', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'ts-with-css');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'ts-with-css', 'bundle.js');
		assertBundleMatchesExpected(dest, 'ts-with-css', 'bundle.css');
	});

	it('should build TypeScript extension with dependency', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'ts-with-dependency');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'ts-with-dependency', 'bundle.js');
	});

	// endregion

	// region: Flow

	it('should build Flow extension and strip type annotations', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'flow-extension');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'flow-extension', 'bundle.js');
	});

	// endregion

	// region: CSS features

	it('should build extension with CSS images inlining', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'css-images');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'css-images', 'extension.bundle.js');
		assertBundleMatchesExpected(dest, 'css-images', 'extension.bundle.css');
	});

	it('should build extension with multiple CSS files preserving order', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'css-multiple');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'css-multiple', 'extension.bundle.css');
	});

	it('should build extension with nested component CSS preserving order', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'css-nested-components');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'css-nested-components', 'extension.bundle.js');
		assertBundleMatchesExpected(dest, 'css-nested-components', 'extension.bundle.css');
	});

	it('should build extension with autoprefixer', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'css-autoprefixer');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'css-autoprefixer', 'extension.bundle.css');
	});

	it('should build CSS-only extension with CSS input', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'css-only');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'css-only', 'bundle.css');
		assert.isFalse(fs.existsSync(path.join(dest, 'dist', 'bundle.js')), 'Should not create empty JS bundle');
	});

	// endregion

	// region: images

	it('should build extension with JS image import', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'js-image-import');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'js-image-import', 'bundle.js');
	});

	// endregion

	// region: namespace and concat

	it('should build extension with namespace wrapping', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'namespace-extension');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'namespace-extension', 'bundle.js');
	});

	it('should build extension with concat preserving order', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'concat-extension');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assertBundleMatchesExpected(dest, 'concat-extension', 'extension.bundle.js');
		assertBundleMatchesExpected(dest, 'concat-extension', 'extension.bundle.css');
	});

	it('should not duplicate bundle when concat file has same basename as output', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'concat-same-basename');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);

		const bundle = fs.readFileSync(path.join(dest, 'app.js'), 'utf-8');
		const exportCount = bundle.split('exports.App = App').length - 1;
		assert.equal(exportCount, 1, 'Bundle content should appear exactly once');
		assert.include(bundle, 'LegacyApp', 'Concat file with same basename should be included as-is');
	});

	// endregion

	// region: standalone

	it('should build standalone JS extension with JS dependency inlined', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'standalone-basic');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);

		const content = fs.readFileSync(path.join(dest, 'dist', 'bundle.js'), 'utf-8');
		assert.include(content, 'StandaloneApp', 'Bundle should contain own class');
		assert.include(content, 'isReady', 'Bundle should contain inlined JS dependency code');
	});

	it('should build standalone JS extension with JS + TS dependencies inlined', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'standalone-js-mixed');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);

		const content = fs.readFileSync(path.join(dest, 'dist', 'bundle.js'), 'utf-8');
		assert.include(content, 'MixedApp', 'Bundle should contain own class');
		assert.include(content, 'isReady', 'Bundle should contain inlined JS dependency code');
		assert.include(content, 'TsLib', 'Bundle should contain inlined TS class');
		assert.include(content, 'getName', 'Bundle should contain inlined TS methods');
		assert.notInclude(content, ': LibConfig', 'TS types should be stripped');
	});

	it('should build standalone TS extension with JS + TS dependencies inlined', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'standalone-ts-mixed');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);

		const content = fs.readFileSync(path.join(dest, 'dist', 'bundle.js'), 'utf-8');
		assert.include(content, 'MixedTsApp', 'Bundle should contain own TS class');
		assert.include(content, 'isReady', 'Bundle should contain inlined JS dependency code');
		assert.include(content, 'TsLib', 'Bundle should contain inlined TS class');
		assert.notInclude(content, ': LibConfig', 'TS types from dependency should be stripped');
		assert.notInclude(content, ': boolean', 'TS types from own code should be stripped');
	});

	it('should build standalone TS extension with Flow dependency inlined', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'standalone-flow-dep');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);

		const content = fs.readFileSync(path.join(dest, 'dist', 'bundle.js'), 'utf-8');
		assert.include(content, 'Wrapper', 'Bundle should contain own TS class');
		assert.include(content, 'FlowComponent', 'Bundle should contain inlined Flow class');
		assert.notInclude(content, ': Options', 'Flow types should be stripped');
	});

	it('should inline type-only dependency in standalone build', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'standalone-type-only');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);

		const content = fs.readFileSync(path.join(dest, 'dist', 'bundle.js'), 'utf-8');
		assert.include(content, 'Widget', 'Bundle should contain own class');
	});

	it('should build standalone with remap to real extension', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'standalone-remap');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);

		const content = fs.readFileSync(path.join(dest, 'dist', 'bundle.js'), 'utf-8');
		assert.include(content, 'RemapApp', 'Bundle should contain own class');
		assert.include(content, 'Form', 'Bundle should contain inlined remapped class');
	});

	it('should build standalone with remap to npm package', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'standalone-remap-npm');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);

		const content = fs.readFileSync(path.join(dest, 'dist', 'bundle.js'), 'utf-8');
		assert.include(content, 'Greeter', 'Bundle should contain own class');
		assert.include(content, 'Hello', 'Bundle should contain inlined npm package code');
	});

	it('should expose inlined dependency namespaces in standalone build', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'standalone-expose');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);

		const content = fs.readFileSync(path.join(dest, 'dist', 'bundle.js'), 'utf-8');
		assert.include(content, 'ExposeApp', 'Bundle should contain own class');
		assert.match(content, /globalThis\.BX\.UI\.NsLib\[k\] = v/, 'Bundle should expose dependency exports to namespace');
	});

	it('should restore exports reference in standalone build', async () => {
		const { dest, extPath } = buildFixture(tmpRepo, 'standalone-basic');

		const { exitCode } = await runChef(['build', '--path', extPath], { cwd: tmpRepo });

		assert.equal(exitCode, 0);

		const content = fs.readFileSync(path.join(dest, 'dist', 'bundle.js'), 'utf-8');
		assert.include(content, '__originalExports__', 'Should save and restore exports reference');
	});

	// endregion

	// region: error cases

	it('should report JS syntax error', async () => {
		const { output } = await runChef(
			['build', '--path', 'ui/install/js/ui/syntax-error'],
			{ cwd: tmpRepo },
		);

		assert.include(output, 'CF1002');
		assert.include(output, 'Unexpected token');
	});

	it('should report CSS syntax error', async () => {
		const { output } = await runChef(
			['build', '--path', 'ui/install/js/ui/css-syntax-error'],
			{ cwd: tmpRepo },
		);

		assert.include(output, 'CF1002');
	});

	// endregion
});
