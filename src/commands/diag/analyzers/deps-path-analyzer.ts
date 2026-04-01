import type { DependencyNode } from '../../../modules/packages/types/dependency-node';

export function findDependencyPath(tree: DependencyNode[], target: string): string[] | null
{
	for (const node of tree)
	{
		const path = dfs(node, target, []);
		if (path)
		{
			return path;
		}
	}

	return null;
}

function dfs(node: DependencyNode, target: string, path: string[]): string[] | null
{
	const currentPath = [...path, node.name];

	if (node.name === target)
	{
		return currentPath;
	}

	for (const child of node.children ?? [])
	{
		const result = dfs(child, target, currentPath);
		if (result)
		{
			return result;
		}
	}

	return null;
}
