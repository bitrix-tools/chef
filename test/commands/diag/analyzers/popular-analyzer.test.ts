import { assert } from 'chai';

import { analyzePopular } from '../../../../src/commands/diag/analyzers/popular-analyzer';
import { createSnapshot } from '../create-snapshot';

describe('analyzePopular', () => {
	it('should count dependents from dependency lists', () => {
		const packages = [
			createSnapshot({ name: 'a', dependencies: ['core', 'utils'] }),
			createSnapshot({ name: 'b', dependencies: ['core'] }),
			createSnapshot({ name: 'c', dependencies: ['core', 'utils', 'lib'] }),
		];

		const results = analyzePopular(packages, 10);

		assert.equal(results[0].name, 'core');
		assert.equal(results[0].dependents, 3);
		assert.equal(results[1].name, 'utils');
		assert.equal(results[1].dependents, 2);
		assert.equal(results[2].name, 'lib');
		assert.equal(results[2].dependents, 1);
	});

	it('should respect limit', () => {
		const packages = [
			createSnapshot({ name: 'a', dependencies: ['x', 'y', 'z'] }),
			createSnapshot({ name: 'b', dependencies: ['x', 'y'] }),
		];

		const results = analyzePopular(packages, 2);

		assert.equal(results.length, 2);
	});

	it('should return empty array when no dependencies', () => {
		const packages = [
			createSnapshot({ name: 'a' }),
			createSnapshot({ name: 'b' }),
		];

		const results = analyzePopular(packages, 10);

		assert.deepEqual(results, []);
	});

	it('should sort by dependents descending', () => {
		const packages = [
			createSnapshot({ name: 'a', dependencies: ['rare', 'common'] }),
			createSnapshot({ name: 'b', dependencies: ['common'] }),
			createSnapshot({ name: 'c', dependencies: ['common'] }),
		];

		const results = analyzePopular(packages, 10);

		assert.equal(results[0].name, 'common');
		assert.equal(results[1].name, 'rare');
	});
});
