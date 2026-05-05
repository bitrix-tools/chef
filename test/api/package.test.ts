import { describe, it, beforeEach } from 'mocha';
import { assert } from 'chai';

import { getPackage } from '../../src/api/get-package';
import { Package } from '../../src/api/package';
import { PackageResolver } from '../../src/modules/packages/package-resolver';

import { sourceRepo } from '../fixtures/index';

describe('Package facade', () => {
	beforeEach(() => {
		PackageResolver.clearCache();
	});

	describe('metadata', () => {
		it('exposes name, path, namespace, isTypeScript', async () => {
			const pkg = await getPackage('ui.ts-valid', { cwd: sourceRepo });
			assert.isNotNull(pkg);

			assert.equal(pkg!.getName(), 'ui.ts-valid');
			assert.include(pkg!.getPath(), 'ui/install/js/ui/ts-valid');
			assert.equal(pkg!.getNamespace(), 'BX.UI.TsValid');
			assert.isTrue(pkg!.isTypeScript());
		});

		it('isTypeScript() is false for JS extension', async () => {
			const pkg = await getPackage('ui.buttons', { cwd: sourceRepo });
			assert.isFalse(pkg!.isTypeScript());
		});

		it('exposes input/output/source paths', async () => {
			const pkg = await getPackage('ui.buttons', { cwd: sourceRepo });

			assert.include(pkg!.getInputPath(), 'ui/install/js/ui/buttons');
			assert.include(pkg!.getOutputJsPath(), 'ui/install/js/ui/buttons');
			assert.include(pkg!.getOutputCssPath(), 'ui/install/js/ui/buttons');

			const sources = pkg!.getSourceFiles();
			assert.isArray(sources);
			assert.isAbove(sources.length, 0);
		});
	});

	describe('configs', () => {
		it('returns BundleConfigManager and PhpConfigManager', async () => {
			const pkg = await getPackage('ui.buttons', { cwd: sourceRepo });

			const bundle = pkg!.getBundleConfig();
			assert.isFunction(bundle.get);

			const php = pkg!.getPhpConfig();
			assert.isFunction(php.get);
		});
	});

	describe('dependencies', () => {
		it('getDependencies() returns string[] from config.php rel', async () => {
			const pkg = await getPackage('ui.buttons', { cwd: sourceRepo });
			const deps = await pkg!.getDependencies();

			assert.isArray(deps);
			assert.include(deps, 'main.core');
			for (const dep of deps)
			{
				assert.isString(dep);
			}
		});

		it('getDependenciesTree() returns tree with children', async () => {
			const pkg = await getPackage('ui.circular-a', { cwd: sourceRepo });
			const tree = await pkg!.getDependenciesTree();

			assert.isArray(tree);
			assert.isAbove(tree.length, 0);
			assert.isString(tree[0].name);
			assert.isArray(tree[0].children);
		});

		it('getDependenciesTreeSize() counts unique deps', async () => {
			const pkg = await getPackage('ui.buttons', { cwd: sourceRepo });
			const size = await pkg!.getDependenciesTreeSize();

			assert.isAtLeast(size, 1);
		});
	});

	describe('sizes', () => {
		it('getBundleSize() returns { js, css, assets, total }', async () => {
			const pkg = await getPackage('ui.buttons', { cwd: sourceRepo });
			const size = pkg!.getBundleSize();

			assert.hasAllKeys(size, ['js', 'css', 'assets', 'total']);
			assert.equal(size.total, size.js + size.css + size.assets);
			for (const value of Object.values(size))
			{
				assert.isNumber(value);
			}
		});
	});

	describe('inspections', () => {
		it('findCircularDependencies() detects mutual dep A → B → A', async () => {
			const pkg = await getPackage('ui.circular-a', { cwd: sourceRepo });
			const cycles = await pkg!.findCircularDependencies();

			assert.isAbove(cycles.length, 0);
			// at least one cycle goes back to ui.circular-a
			const hasMutual = cycles.some((cycle) => cycle.includes('ui.circular-a') && cycle.includes('ui.circular-b'));
			assert.isTrue(hasMutual);
		});

		it('findCircularDependencies() returns [] when no cycles', async () => {
			const pkg = await getPackage('ui.buttons', { cwd: sourceRepo });
			const cycles = await pkg!.findCircularDependencies();

			assert.deepEqual(cycles, []);
		});

		it('findCircularImports() detects file-level cycles', async () => {
			const pkg = await getPackage('ui.circular-imports', { cwd: sourceRepo });
			const cycles = await pkg!.findCircularImports();

			assert.isAbove(cycles.length, 0);
			// each cycle is an array of file paths
			for (const cycle of cycles)
			{
				assert.isArray(cycle);
				assert.isAbove(cycle.length, 1);
			}
		});

		it('findUnusedDependencies() returns string[]', async () => {
			const pkg = await getPackage('ui.buttons', { cwd: sourceRepo });
			const unused = await pkg!.findUnusedDependencies();

			assert.isArray(unused);
			for (const name of unused)
			{
				assert.isString(name);
			}
		});
	});
});
