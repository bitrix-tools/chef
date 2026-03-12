import { formatSize, formatSizeWithDelta } from '../../utils/format-size';

import type { BasePackage } from '../../modules/packages/base-package';
import type { Task, TaskResult, TaskDetail } from '../../modules/task/task-types';

type PreviousSizes = {
	previousJsSize: number | null;
	previousCssSize: number | null;
};

export function bundleSizeTask(extension: BasePackage, previousSizes?: PreviousSizes): Task
{
	return {
		title: 'Bundle size',
		run: async (): Promise<TaskResult> => {
			const bundleSize = extension.getBundlesSize();
			const details: TaskDetail[] = [];

			if (bundleSize.js > 0)
			{
				const formattedJsSize = previousSizes
					? formatSizeWithDelta(bundleSize.js, previousSizes.previousJsSize ?? null)
					: formatSize({ size: bundleSize.js });
				details.push({ type: 'item', text: `→ JS: ${formattedJsSize}` });
			}

			if (bundleSize.css > 0)
			{
				const formattedCssSize = previousSizes
					? formatSizeWithDelta(bundleSize.css, previousSizes.previousCssSize ?? null)
					: formatSize({ size: bundleSize.css });
				details.push({ type: 'item', text: `→ CSS: ${formattedCssSize}` });
			}

			if (bundleSize.js > 0 && bundleSize.css > 0)
			{
				const formattedTotalSize = formatSize({
					size: bundleSize.js + bundleSize.css,
					decimals: 1,
				});
				details.push({ type: 'item', text: `→ Total: ${formattedTotalSize}` });
			}

			return {
				title: 'Bundle size',
				status: 'passed',
				details: details.length > 0 ? details : undefined,
			};
		},
	};
}
