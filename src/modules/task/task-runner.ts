import { TaskReporter } from './task-reporter';
import { CF } from '../../diagnostics/diagnostic-codes';

import type { TaskGroup, TaskGroupResult } from './task-types';

export class TaskRunner
{
	static async run(group: TaskGroup): Promise<TaskGroupResult>
	{
		const reporter = new TaskReporter(group.title, group.tasks.length);

		for (const task of group.tasks)
		{
			reporter.startTask(task.title);

			try
			{
				const result = await task.run((message) => {
					reporter.updateTask(message);
				});

				reporter.completeTask(result);
			}
			catch (error: any)
			{
				const code = (typeof error?.code === 'string' && error.code.startsWith('CF'))
					? error.code
					: CF.UNCAUGHT_EXCEPTION;

				reporter.completeTask({
					title: task.title,
					status: 'failed',
					details: [
						{ type: 'error', code, message: error.message || 'Unknown error', stack: error.stack },
					],
				});
			}
		}

		return reporter.finish();
	}
}
