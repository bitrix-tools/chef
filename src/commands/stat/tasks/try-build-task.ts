import chalk from 'chalk';

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
					title: `Has build errors — run ${chalk.cyan(`chef build ${extension.getName()}`)} for details`,
					status: 'failed',
				};
			}

			if (buildResult.warnings.length > 0)
			{
				return {
					title: `Has build warnings — run ${chalk.cyan(`chef build ${extension.getName()}`)} for details`,
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
