import chalk from 'chalk';

import { generateTreeString } from '../../utils/generate-tree';

import type { BasePackage } from '../../modules/packages/base-package';
import type { Task, TaskResult } from '../../modules/task/task-types';

export function dependenciesTreeTask(extension: BasePackage): Task
{
	return {
		title: 'Dependencies tree',
		run: async (): Promise<TaskResult> => {
			const dependenciesTree = await extension.getDependenciesTree({ size: true });
			const uniqueDependencies = await extension.getFlattedDependenciesTree();
			const allDependencies = await extension.getFlattedDependenciesTree(false);

			return {
				title: `Dependencies tree (${uniqueDependencies.length} (${chalk.grey(allDependencies.length)}))`,
				status: 'passed',
				details: dependenciesTree.length > 0
					? [{ type: 'item', text: generateTreeString(dependenciesTree) }]
					: undefined,
			};
		},
	};
}
