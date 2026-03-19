import { assert } from 'chai';

import { analyzeUnusedDeps } from '../../../../src/commands/diag/analyzers/unused-deps-analyzer';
import { createSnapshot } from '../create-snapshot';

describe('analyzeUnusedDeps', () => {
	it('should detect unused dependencies', () => {
		const packages = [
			createSnapshot({
				name: 'a',
				dependencies: ['used', 'unused'],
				importedExtensions: new Set(['used']),
			}),
		];

		const results = analyzeUnusedDeps(packages, 10);

		assert.equal(results.length, 1);
		assert.equal(results[0].name, 'a');
		assert.deepEqual(results[0].unused, ['unused']);
	});

	it('should consider namespace usage as used', () => {
		const depPackage = createSnapshot({
			name: 'ui.bbcode',
			exportedGlobals: new Set(['BX.UI.BBCode.Parser']),
		});

		const packages = [
			depPackage,
			createSnapshot({
				name: 'a',
				dependencies: ['ui.bbcode'],
				importedExtensions: new Set(),
				usedNamespaces: new Set(['BX.UI.BBCode.Parser']),
			}),
		];

		const results = analyzeUnusedDeps(packages, 10);

		assert.equal(results.length, 0);
	});

	it('should match namespace prefix for globals', () => {
		const depPackage = createSnapshot({
			name: 'ui.lib',
			exportedGlobals: new Set(['BX.UI.Lib.Widget']),
		});

		const packages = [
			depPackage,
			createSnapshot({
				name: 'a',
				dependencies: ['ui.lib'],
				importedExtensions: new Set(),
				usedNamespaces: new Set(['BX.UI.Lib.Widget.render']),
			}),
		];

		const results = analyzeUnusedDeps(packages, 10);

		assert.equal(results.length, 0);
	});

	it('should not match partial namespace', () => {
		const depPackage = createSnapshot({
			name: 'ui.lib',
			exportedGlobals: new Set(['BX.UI.Lib']),
		});

		const packages = [
			depPackage,
			createSnapshot({
				name: 'a',
				dependencies: ['ui.lib'],
				importedExtensions: new Set(),
				usedNamespaces: new Set(['BX.UI.LibExtra']),
			}),
		];

		const results = analyzeUnusedDeps(packages, 10);

		assert.equal(results.length, 1);
		assert.deepEqual(results[0].unused, ['ui.lib']);
	});

	it('should filter out packages with no unused deps', () => {
		const packages = [
			createSnapshot({
				name: 'a',
				dependencies: ['x'],
				importedExtensions: new Set(['x']),
			}),
		];

		const results = analyzeUnusedDeps(packages, 10);

		assert.equal(results.length, 0);
	});

	it('should sort by unused count descending', () => {
		const packages = [
			createSnapshot({
				name: 'a',
				dependencies: ['x'],
				importedExtensions: new Set(),
			}),
			createSnapshot({
				name: 'b',
				dependencies: ['x', 'y', 'z'],
				importedExtensions: new Set(),
			}),
		];

		const results = analyzeUnusedDeps(packages, 10);

		assert.equal(results[0].name, 'b');
		assert.equal(results[0].unused.length, 3);
		assert.equal(results[1].name, 'a');
	});

	it('should respect limit', () => {
		const packages = [
			createSnapshot({ name: 'a', dependencies: ['x'], importedExtensions: new Set() }),
			createSnapshot({ name: 'b', dependencies: ['x', 'y'], importedExtensions: new Set() }),
			createSnapshot({ name: 'c', dependencies: ['x', 'y', 'z'], importedExtensions: new Set() }),
		];

		const results = analyzeUnusedDeps(packages, 2);

		assert.equal(results.length, 2);
	});
});
