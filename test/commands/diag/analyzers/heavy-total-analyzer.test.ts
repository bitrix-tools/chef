import { assert } from 'chai';

import { analyzeHeavyTotal } from '../../../../src/commands/diag/analyzers/heavy-total-analyzer';
import { createSnapshot } from '../create-snapshot';

describe('analyzeHeavyTotal', () => {
	it('should calculate own and total sizes', () => {
		const packages = [
			createSnapshot({
				name: 'a',
				bundleSize: { js: 100, css: 50 },
				totalSize: { js: 500, css: 200 },
				dependencies: ['x', 'y'],
				dependencyTreeSize: 5,
			}),
		];

		const results = analyzeHeavyTotal(packages, 10);

		assert.equal(results[0].ownJs, 100);
		assert.equal(results[0].ownCss, 50);
		assert.equal(results[0].ownTotal, 150);
		assert.equal(results[0].js, 500);
		assert.equal(results[0].css, 200);
		assert.equal(results[0].total, 700);
		assert.equal(results[0].directDeps, 2);
		assert.equal(results[0].treeDeps, 5);
	});

	it('should sort by total descending', () => {
		const packages = [
			createSnapshot({ name: 'a', totalSize: { js: 100, css: 0 } }),
			createSnapshot({ name: 'b', totalSize: { js: 500, css: 0 } }),
			createSnapshot({ name: 'c', totalSize: { js: 300, css: 0 } }),
		];

		const results = analyzeHeavyTotal(packages, 10);

		assert.equal(results[0].name, 'b');
		assert.equal(results[1].name, 'c');
		assert.equal(results[2].name, 'a');
	});

	it('should filter out packages with zero total size', () => {
		const packages = [
			createSnapshot({ name: 'a', totalSize: { js: 100, css: 0 } }),
			createSnapshot({ name: 'b', totalSize: { js: 0, css: 0 } }),
		];

		const results = analyzeHeavyTotal(packages, 10);

		assert.equal(results.length, 1);
	});

	it('should respect limit', () => {
		const packages = [
			createSnapshot({ name: 'a', totalSize: { js: 300, css: 0 } }),
			createSnapshot({ name: 'b', totalSize: { js: 200, css: 0 } }),
			createSnapshot({ name: 'c', totalSize: { js: 100, css: 0 } }),
		];

		const results = analyzeHeavyTotal(packages, 1);

		assert.equal(results.length, 1);
		assert.equal(results[0].name, 'a');
	});
});
