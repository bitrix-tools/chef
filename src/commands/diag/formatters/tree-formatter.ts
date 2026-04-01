import chalk from 'chalk';

import type { DependencyNode } from '../../../modules/packages/types/dependency-node';

type FormatTreeOptions = {
	tree: DependencyNode[];
	rootName: string;
	depth?: number;
	unique?: boolean;
};

export function formatTree({ tree, rootName, depth, unique = false }: FormatTreeOptions): string
{
	const lines: string[] = [chalk.bold(rootName)];
	const visited = new Set<string>();

	for (let i = 0; i < tree.length; i++)
	{
		const isLast = i === tree.length - 1;
		formatNode(tree[i], '', isLast, lines, visited, depth, unique, 1);
	}

	return lines.join('\n');
}

function formatNode(
	node: DependencyNode,
	prefix: string,
	isLast: boolean,
	lines: string[],
	visited: Set<string>,
	maxDepth: number | undefined,
	unique: boolean,
	currentDepth: number,
): void
{
	const connector = isLast ? '└── ' : '├── ';
	const childPrefix = isLast ? '    ' : '│   ';

	const isDuplicate = unique && visited.has(node.name);
	visited.add(node.name);

	const children = node.children ?? [];
	const hasChildren = children.length > 0;
	const isDepthLimited = maxDepth !== undefined && currentDepth >= maxDepth;

	if (isDuplicate)
	{
		lines.push(`${prefix}${connector}${chalk.dim(node.name)} ${chalk.dim('(duplicate)')}`);
		return;
	}

	if (isDepthLimited && hasChildren)
	{
		lines.push(`${prefix}${connector}${node.name} ${chalk.dim(`(${countSubtree(node)} deps...)`)}`);
		return;
	}

	lines.push(`${prefix}${connector}${node.name}`);

	for (let i = 0; i < children.length; i++)
	{
		const isChildLast = i === children.length - 1;
		formatNode(
			children[i],
			prefix + childPrefix,
			isChildLast,
			lines,
			visited,
			maxDepth,
			unique,
			currentDepth + 1,
		);
	}
}

function countSubtree(node: DependencyNode): number
{
	let count = 0;
	const stack = [...(node.children ?? [])];

	while (stack.length > 0)
	{
		const current = stack.pop()!;
		count++;

		if (current.children)
		{
			stack.push(...current.children);
		}
	}

	return count;
}
