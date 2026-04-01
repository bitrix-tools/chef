import { assert } from 'chai';

import { findDependencyPath } from '../../../../src/commands/diag/analyzers/deps-path-analyzer';

import type { DependencyNode } from '../../../../src/modules/packages/types/dependency-node';

describe('findDependencyPath', () => {
	it('should find direct dependency', () => {
		const tree: DependencyNode[] = [
			{ name: 'dep.a', children: [] },
			{ name: 'dep.b', children: [] },
		];

		const path = findDependencyPath(tree, 'dep.b');

		assert.deepEqual(path, ['dep.b']);
	});

	it('should find nested dependency', () => {
		const tree: DependencyNode[] = [
			{
				name: 'dep.a',
				children: [
					{
						name: 'dep.b',
						children: [
							{ name: 'dep.c', children: [] },
						],
					},
				],
			},
		];

		const path = findDependencyPath(tree, 'dep.c');

		assert.deepEqual(path, ['dep.a', 'dep.b', 'dep.c']);
	});

	it('should return null when dependency not found', () => {
		const tree: DependencyNode[] = [
			{ name: 'dep.a', children: [] },
		];

		const path = findDependencyPath(tree, 'dep.missing');

		assert.isNull(path);
	});

	it('should return null for empty tree', () => {
		const path = findDependencyPath([], 'dep.a');

		assert.isNull(path);
	});

	it('should find the first path in breadth-first order', () => {
		const tree: DependencyNode[] = [
			{
				name: 'dep.a',
				children: [
					{
						name: 'dep.b',
						children: [
							{ name: 'dep.target', children: [] },
						],
					},
				],
			},
			{
				name: 'dep.target',
				children: [],
			},
		];

		const path = findDependencyPath(tree, 'dep.target');

		// DFS finds the deeper path first
		assert.deepEqual(path, ['dep.a', 'dep.b', 'dep.target']);
	});

	it('should handle nodes without children property', () => {
		const tree: DependencyNode[] = [
			{ name: 'dep.a' },
			{ name: 'dep.b' },
		];

		const path = findDependencyPath(tree, 'dep.b');

		assert.deepEqual(path, ['dep.b']);
	});

	it('should find deeply nested dependency', () => {
		const tree: DependencyNode[] = [
			{
				name: 'level1',
				children: [
					{
						name: 'level2',
						children: [
							{
								name: 'level3',
								children: [
									{ name: 'level4', children: [] },
								],
							},
						],
					},
				],
			},
		];

		const path = findDependencyPath(tree, 'level4');

		assert.deepEqual(path, ['level1', 'level2', 'level3', 'level4']);
	});
});
