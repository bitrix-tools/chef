import { assert } from 'chai';

import { formatTree } from '../../../../src/commands/diag/formatters/tree-formatter';

import type { DependencyNode } from '../../../../src/modules/packages/types/dependency-node';

function stripAnsi(str: string): string
{
	return str.replace(/\x1B\[[0-9;]*m/g, '');
}

describe('formatTree', () => {
	it('should show root name and direct dependencies', () => {
		const tree: DependencyNode[] = [
			{ name: 'dep.a', children: [] },
			{ name: 'dep.b', children: [] },
		];

		const output = stripAnsi(formatTree({ tree, rootName: 'my.extension' }));

		assert.include(output, 'my.extension');
		assert.include(output, 'dep.a');
		assert.include(output, 'dep.b');
	});

	it('should show nested dependencies with tree connectors', () => {
		const tree: DependencyNode[] = [
			{
				name: 'dep.a',
				children: [
					{ name: 'dep.a.child', children: [] },
				],
			},
			{ name: 'dep.b', children: [] },
		];

		const output = stripAnsi(formatTree({ tree, rootName: 'root' }));
		const lines = output.split('\n');

		assert.equal(lines[0], 'root');
		assert.include(lines[1], '├── dep.a');
		assert.include(lines[2], '│   └── dep.a.child');
		assert.include(lines[3], '└── dep.b');
	});

	it('should use └── for the last child', () => {
		const tree: DependencyNode[] = [
			{ name: 'only.child', children: [] },
		];

		const output = stripAnsi(formatTree({ tree, rootName: 'root' }));
		const lines = output.split('\n');

		assert.include(lines[1], '└── only.child');
	});

	it('should handle empty tree', () => {
		const output = stripAnsi(formatTree({ tree: [], rootName: 'leaf' }));

		assert.equal(output, 'leaf');
	});

	it('should mark duplicates when unique is true', () => {
		const tree: DependencyNode[] = [
			{
				name: 'dep.a',
				children: [
					{ name: 'dep.shared', children: [] },
				],
			},
			{
				name: 'dep.b',
				children: [
					{ name: 'dep.shared', children: [] },
				],
			},
		];

		const output = stripAnsi(formatTree({ tree, rootName: 'root', unique: true }));

		const lines = output.split('\n');
		const sharedLines = lines.filter((l) => l.includes('dep.shared'));

		assert.equal(sharedLines.length, 2);
		assert.notInclude(sharedLines[0], 'duplicate');
		assert.include(sharedLines[1], '(duplicate)');
	});

	it('should not mark duplicates when unique is false', () => {
		const tree: DependencyNode[] = [
			{
				name: 'dep.a',
				children: [
					{ name: 'dep.shared', children: [] },
				],
			},
			{
				name: 'dep.b',
				children: [
					{ name: 'dep.shared', children: [] },
				],
			},
		];

		const output = stripAnsi(formatTree({ tree, rootName: 'root', unique: false }));

		assert.notInclude(output, 'duplicate');
	});

	it('should truncate tree at specified depth', () => {
		const tree: DependencyNode[] = [
			{
				name: 'dep.a',
				children: [
					{
						name: 'dep.deep',
						children: [
							{ name: 'dep.deeper', children: [] },
						],
					},
				],
			},
		];

		const output = stripAnsi(formatTree({ tree, rootName: 'root', depth: 1 }));

		assert.include(output, 'dep.a');
		assert.notInclude(output, 'dep.deep');
		assert.notInclude(output, 'dep.deeper');
	});

	it('should show subtree count when depth-limited', () => {
		const tree: DependencyNode[] = [
			{
				name: 'dep.a',
				children: [
					{ name: 'dep.b', children: [] },
					{ name: 'dep.c', children: [] },
				],
			},
		];

		const output = stripAnsi(formatTree({ tree, rootName: 'root', depth: 1 }));

		assert.include(output, '(2 deps...)');
	});

	it('should not show deps count for leaf nodes at depth limit', () => {
		const tree: DependencyNode[] = [
			{ name: 'dep.leaf', children: [] },
		];

		const output = stripAnsi(formatTree({ tree, rootName: 'root', depth: 1 }));

		assert.include(output, 'dep.leaf');
		assert.notInclude(output, 'deps...');
	});

	it('should handle depth 2 correctly', () => {
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

		const output = stripAnsi(formatTree({ tree, rootName: 'root', depth: 2 }));

		assert.include(output, 'dep.a');
		assert.include(output, 'dep.b');
		assert.notInclude(output, 'dep.c');
	});

	it('should combine unique and depth options', () => {
		const tree: DependencyNode[] = [
			{
				name: 'dep.a',
				children: [
					{ name: 'dep.shared', children: [] },
				],
			},
			{
				name: 'dep.b',
				children: [
					{ name: 'dep.shared', children: [] },
				],
			},
		];

		const output = stripAnsi(formatTree({ tree, rootName: 'root', unique: true, depth: 2 }));

		assert.include(output, 'dep.a');
		assert.include(output, 'dep.b');
		assert.include(output, '(duplicate)');
	});
});
