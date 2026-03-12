import { summaryFormatter } from '../../modules/engines/lint/summary-formatter';
import { verboseFormatter } from '../../modules/engines/lint/verbose-formatter';

import type { BasePackage } from '../../modules/packages/base-package';
import type { Task, TaskResult } from '../../modules/task/task-types';

const STATUS_MAP = {
	succeed: 'passed',
	warn: 'warning',
	fail: 'failed',
} as const;

export function lintTask(extension: BasePackage, args?: Record<string, any>): Task
{
	return {
		title: 'ESLint analysis...',
		run: async (): Promise<TaskResult> => {
			const result = await extension.lint();

			if (args?.verbose)
			{
				const verboseResult = verboseFormatter(result);
				const summaryResult = summaryFormatter(result);

				return {
					title: summaryResult.title,
					status: STATUS_MAP[verboseResult.level],
					details: verboseResult.text.length > 0
						? [{ type: 'block', text: verboseResult.text }]
						: undefined,
				};
			}

			const summaryResult = summaryFormatter(result);

			return {
				title: summaryResult.title,
				status: STATUS_MAP[summaryResult.level],
			};
		},
	};
}
