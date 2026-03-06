import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task } from '../../../modules/task/task';
import { summaryFormatter } from '../../../modules/formatters/lint/summary.formatter';

export function lintTask(extension: BasePackage): Task
{
	return {
		title: 'ESLint analysis...',
		run: async (context) => {
			const result = await extension.lint();
			const { title, level } = await summaryFormatter(result);

			context[level](title);
		},
	};
}
