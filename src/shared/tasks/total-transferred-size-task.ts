import { formatSize } from '../../utils/format-size';

import type { BasePackage } from '../../modules/packages/base-package';
import type { Task, TaskResult, TaskDetail } from '../../modules/task/task-types';

export function totalTransferredSizeTask(extension: BasePackage): Task
{
	return {
		title: 'Total transferred size',
		run: async (): Promise<TaskResult> => {
			const totalTransferredSize = await extension.getTotalTransferredSize();
			const details: TaskDetail[] = [];

			if (totalTransferredSize.js > 0)
			{
				const formattedJsSize = formatSize({
					size: totalTransferredSize.js,
				});
				details.push({ type: 'item', text: `→ JS: ${formattedJsSize}` });
			}

			if (totalTransferredSize.css > 0)
			{
				const formattedCssSize = formatSize({
					size: totalTransferredSize.css,
				});
				details.push({ type: 'item', text: `→ CSS: ${formattedCssSize}` });
			}

			return {
				title: 'Total transferred size',
				status: 'passed',
				details: details.length > 0 ? details : undefined,
			};
		},
	};
}
