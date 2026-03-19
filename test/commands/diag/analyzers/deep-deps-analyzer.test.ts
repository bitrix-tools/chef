import { assert } from 'chai';

import { analyzeDeepDeps } from '../../../../src/commands/diag/analyzers/deep-deps-analyzer';
import { createSnapshot } from '../create-snapshot';

describe('analyzeDeepDeps', () => {
	it('should sort by tree size descending', () => {
		const packages = [
			createSnapshot({ name: 'a', dependencyTreeSize: 5 }),
			createSnapshot({ name: 'b', dependencyTreeSize: 20 }),
			createSnapshot({ name: 'c', dependencyTreeSize: 10 }),
		];

		const results = analyzeDeepDeps(packages, 10);

		assert.equal(results[0].name, 'b');
		assert.equal(results[0].treeSize, 20);
		assert.equal(results[1].name, 'c');
		assert.equal(results[2].name, 'a');
	});

	it('should filter out packages with zero tree size', () => {
		const packages = [
			createSnapshot({ name: 'a', dependencyTreeSize: 10 }),
			createSnapshot({ name: 'b', dependencyTreeSize: 0 }),
		];

		const results = analyzeDeepDeps(packages, 10);

		assert.equal(results.length, 1);
		assert.equal(results[0].name, 'a');
	});

	it('should respect limit', () => {
		const packages = [
			createSnapshot({ name: 'a', dependencyTreeSize: 30 }),
			createSnapshot({ name: 'b', dependencyTreeSize: 20 }),
			createSnapshot({ name: 'c', dependencyTreeSize: 10 }),
		];

		const results = analyzeDeepDeps(packages, 1);

		assert.equal(results.length, 1);
		assert.equal(results[0].name, 'a');
	});
});
