import chalk from 'chalk';

import { findCircularDependencies } from '../../../utils/package/find-circular-dependencies';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult } from '../../../modules/task/task-types';

export function circularDependenciesTask(extension: BasePackage): Task
{
	return {
		title: 'Circular dependencies',
		run: async (): Promise<TaskResult> => {
			const cycles = await findCircularDependencies({ target: extension });

			if (cycles.length === 0)
			{
				return {
					title: 'No circular dependencies',
					status: 'passed',
				};
			}

			const rootName = extension.getName();
			const details = cycles.map(([depName]) => {
				const formatted = `${chalk.red(rootName)} ${chalk.grey('→')} ${depName} ${chalk.grey('→')} ${chalk.red(rootName)}`;

				return { type: 'item' as const, text: formatted };
			});

			return {
				title: `Found ${cycles.length} circular ${cycles.length === 1 ? 'dependency' : 'dependencies'}`,
				status: 'failed',
				details,
			};
		},
	};
}
