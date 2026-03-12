import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult } from '../../../modules/task/task-types';

export function tryBuildTask(extension: BasePackage): Task
{
	return {
		title: 'Find build errors...',
		run: async (): Promise<TaskResult> => {
			const buildResult = await extension.generate();

			if (buildResult.errors.length > 0)
			{
				return {
					title: `Has build errors --> Run chef build -e=${extension.getName()} for more information`,
					status: 'failed',
				};
			}

			if (buildResult.warnings.length > 0)
			{
				return {
					title: `Has build warnings --> Run chef build -e=${extension.getName()} for more information`,
					status: 'warning',
				};
			}

			return {
				title: 'No build issues found',
				status: 'passed',
			};
		},
	};
}
