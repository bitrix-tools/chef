import { assert } from 'chai';

import { analyzeHeavyDeps } from '../../../../src/commands/diag/analyzers/heavy-deps-analyzer';
import { createSnapshot } from '../create-snapshot';

describe('analyzeHeavyDeps', () => {
	it('should count direct dependencies', () => {
		const packages = [
			createSnapshot({ name: 'a', dependencies: ['x', 'y', 'z'] }),
			createSnapshot({ name: 'b', dependencies: ['x'] }),
		];

		const results = analyzeHeavyDeps(packages, 10);

		assert.equal(results[0].name, 'a');
		assert.equal(results[0].directDeps, 3);
		assert.equal(results[1].name, 'b');
		assert.equal(results[1].directDeps, 1);
	});

	it('should filter out packages with no dependencies', () => {
		const packages = [
			createSnapshot({ name: 'a', dependencies: ['x'] }),
			createSnapshot({ name: 'b', dependencies: [] }),
		];

		const results = analyzeHeavyDeps(packages, 10);

		assert.equal(results.length, 1);
		assert.equal(results[0].name, 'a');
	});

	it('should respect limit', () => {
		const packages = [
			createSnapshot({ name: 'a', dependencies: ['x', 'y'] }),
			createSnapshot({ name: 'b', dependencies: ['x'] }),
			createSnapshot({ name: 'c', dependencies: ['x', 'y', 'z'] }),
		];

		const results = analyzeHeavyDeps(packages, 2);

		assert.equal(results.length, 2);
		assert.equal(results[0].name, 'c');
		assert.equal(results[1].name, 'a');
	});
});
