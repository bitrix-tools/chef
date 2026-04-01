import { assert } from 'chai';

import { analyzeHeavyBundles } from '../../../../src/commands/diag/analyzers/heavy-bundles-analyzer';
import { createSnapshot } from '../create-snapshot';

describe('analyzeHeavyBundles', () => {
	it('should calculate total from js and css', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleSize: { js: 1000, css: 500 } }),
		];

		const results = analyzeHeavyBundles(packages, 10);

		assert.equal(results[0].js, 1000);
		assert.equal(results[0].css, 500);
		assert.equal(results[0].total, 1500);
	});

	it('should sort by total descending', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleSize: { js: 100, css: 100 } }),
			createSnapshot({ name: 'b', bundleSize: { js: 500, css: 500 } }),
			createSnapshot({ name: 'c', bundleSize: { js: 300, css: 0 } }),
		];

		const results = analyzeHeavyBundles(packages, 10);

		assert.equal(results[0].name, 'b');
		assert.equal(results[1].name, 'c');
		assert.equal(results[2].name, 'a');
	});

	it('should filter out packages with zero size', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleSize: { js: 100, css: 0 } }),
			createSnapshot({ name: 'b', bundleSize: { js: 0, css: 0 } }),
		];

		const results = analyzeHeavyBundles(packages, 10);

		assert.equal(results.length, 1);
		assert.equal(results[0].name, 'a');
	});

	it('should sort by js when specified', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleSize: { js: 100, css: 900 } }),
			createSnapshot({ name: 'b', bundleSize: { js: 500, css: 0 } }),
			createSnapshot({ name: 'c', bundleSize: { js: 300, css: 200 } }),
		];

		const results = analyzeHeavyBundles(packages, 10, 'js');

		assert.equal(results[0].name, 'b');
		assert.equal(results[1].name, 'c');
		assert.equal(results[2].name, 'a');
	});

	it('should sort by css when specified', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleSize: { js: 900, css: 100 } }),
			createSnapshot({ name: 'b', bundleSize: { js: 0, css: 500 } }),
			createSnapshot({ name: 'c', bundleSize: { js: 200, css: 300 } }),
		];

		const results = analyzeHeavyBundles(packages, 10, 'css');

		assert.equal(results[0].name, 'b');
		assert.equal(results[1].name, 'c');
		assert.equal(results[2].name, 'a');
	});

	it('should respect limit', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleSize: { js: 300, css: 0 } }),
			createSnapshot({ name: 'b', bundleSize: { js: 200, css: 0 } }),
			createSnapshot({ name: 'c', bundleSize: { js: 100, css: 0 } }),
		];

		const results = analyzeHeavyBundles(packages, 2);

		assert.equal(results.length, 2);
	});
});
