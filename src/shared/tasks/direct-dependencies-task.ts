import { generateTreeString } from '../../utils/generate-tree';

import type { BasePackage } from '../../modules/packages/base-package';
import type { Task, TaskResult } from '../../modules/task/task-types';

export function directDependenciesTask(extension: BasePackage): Task
{
	return {
		title: 'Direct dependencies',
		run: async (): Promise<TaskResult> => {
			const dependencies = await extension.getDependencies();

			return {
				title: `Direct dependencies (${dependencies.length})`,
				status: 'passed',
				details: dependencies.length > 0
					? [{ type: 'item', text: generateTreeString(dependencies) }]
					: undefined,
			};
		},
	};
}
