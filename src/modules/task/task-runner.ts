import { TaskReporter } from './task-reporter';

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
				reporter.completeTask({
					title: task.title,
					status: 'failed',
					details: [
						{ type: 'error', message: error.message || 'Unknown error', stack: error.stack },
					],
				});
			}
		}

		return reporter.finish();
	}
}
