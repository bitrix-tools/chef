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
import { PackageBuilder } from '../../src/modules/services/package-builder';
import { inlineStrategy } from '../../src/modules/config/bundle/strategies/inline-strategy';
import { CF } from '../../src/diagnostics/diagnostic-codes';

import { sourceRepo, extensionPath } from '../fixtures/index';

import type { BuildOptions } from '../../src/modules/engines/build/build-types';

function cleanDist(dir: string): void
{
	fs.rmSync(path.join(dir, 'dist'), { recursive: true, force: true });
}

function getBuildOptions(dir: string, packageName: string): BuildOptions
{
	const bundleConfig = new BundleConfigManager();
	bundleConfig.loadFromFile(path.join(dir, 'bundle.config.js'));

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
		inline: bundleConfig.get('inline'),
	};
}

describe('inline build', () => {
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

	describe('inlined extension', () => {
		const dir = extensionPath('inline-basic');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should bundle only the used code of the inlined extension', async () => {
			const result = await buildService.build(getBuildOptions(dir, 'ui.inline-basic'));

			assert.isEmpty(result.errors);

			const content = fs.readFileSync(path.join(dir, 'dist', 'inline-basic.bundle.js'), 'utf-8');
			assert.include(content, 'inline-used-marker', 'Used export should be bundled');
			assert.notInclude(content, 'inline-unused-marker', 'Unused export should be tree-shaken');
		});

		it('should leave the inlined extension out of dependencies', async () => {
			const result = await buildService.build(getBuildOptions(dir, 'ui.inline-basic'));

			assert.notInclude(result.dependencies, 'ui.inline-lib');
			assert.deepEqual(result.inlined, ['ui.inline-lib']);
		});

		it('should keep dependencies of the inlined extension external', async () => {
			const result = await buildService.build(getBuildOptions(dir, 'ui.inline-basic'));

			assert.include(result.dependencies, 'main.core', 'Import inside inlined code should stay external');
			assert.include(result.dependencies, 'main.ts-lib', 'Extension not listed in inline should stay external');
		});

		it('should match extension names by glob pattern', async () => {
			const result = await buildService.build({
				...getBuildOptions(dir, 'ui.inline-basic'),
				inline: ['ui.inline-*', 'main.*'],
			});

			assert.isEmpty(result.errors);
			assert.deepEqual(result.inlined, ['main.core', 'main.ts-lib', 'ui.inline-lib']);
			assert.notInclude(result.dependencies, 'main.core');

			const content = fs.readFileSync(path.join(dir, 'dist', 'inline-basic.bundle.js'), 'utf-8');
			assert.include(content, 'getName', 'TypeScript dependency should be inlined into JS extension');
		});

		it('should treat imports as external without the inline option', async () => {
			const result = await buildService.build({
				...getBuildOptions(dir, 'ui.inline-basic'),
				inline: [],
			});

			assert.include(result.dependencies, 'ui.inline-lib');
			assert.isEmpty(result.inlined);
		});
	});

	describe('test bundle', () => {
		it('should inline extensions into the test bundle', async () => {
			const result = await buildService.buildCode({
				code: `import { usedHelper } from 'ui.inline-lib';\nusedHelper();`,
				packageRoot: extensionPath('inline-basic'),
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.TestsBundle',
				packageName: 'ui.inline-basic',
				inline: ['ui.inline-lib'],
			});

			assert.isEmpty(result.errors);
			assert.include(result.code, 'inline-used-marker');
			assert.notInclude(result.dependencies, 'ui.inline-lib');
			assert.include(result.dependencies, 'main.core');
		});
	});

	describe('missing extension', () => {
		const dir = extensionPath('inline-missing');

		beforeEach(() => cleanDist(dir));
		afterEach(() => cleanDist(dir));

		it('should fail when an extension listed in inline has no source', async () => {
			const result = await buildService.build(getBuildOptions(dir, 'ui.inline-missing'));

			assert.lengthOf(result.errors, 1);
			assert.equal(result.errors[0].code, CF.INLINE_NOT_FOUND);
			assert.include(result.errors[0].message, 'ui.inline-absent');
		});
	});

	describe('extension also loaded by a dependency', () => {
		const dir = extensionPath('inline-duplicate');
		const configPhpPath = path.join(dir, 'config.php');
		let originalConfigPhp: string;

		beforeEach(() => {
			cleanDist(dir);
			originalConfigPhp = fs.readFileSync(configPhpPath, 'utf-8');
		});

		afterEach(() => {
			cleanDist(dir);
			fs.writeFileSync(configPhpPath, originalConfigPhp);
		});

		it('should warn that the inlined code is duplicated on the page', async () => {
			// The engine is imported dynamically by PackageBuilder and would not see the stubbed Environment.
			sandbox.stub(PackageBuilder, 'getBuildEngine').resolves(buildService);

			const result = await new PackageBuilder(PackageResolver.resolve('ui.inline-duplicate')).build();

			assert.isEmpty(result.errors, result.errors.map((error) => error.message).join('\n'));

			const warning = result.warnings.find((item) => item.code === CF.INLINE_DUPLICATED);
			assert.exists(warning, 'Should warn about duplicated inlined extension');
			assert.include(warning.message, 'ui.forms → ui.buttons');
		});
	});
});

describe('inlineStrategy', () => {
	it('should default to an empty list', () => {
		assert.deepEqual(inlineStrategy.getDefault(), []);
	});

	it('should accept an array of strings', () => {
		assert.isTrue(inlineStrategy.validate(['ui.bbcode.*', 'main.core']));
	});

	it('should reject a string', () => {
		assert.isString(inlineStrategy.validate('ui.bbcode.parser'));
	});

	it('should reject an array with non-string items', () => {
		assert.isString(inlineStrategy.validate(['ui.bbcode.parser', 1]));
	});
});
