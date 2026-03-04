import { formatSize, formatSizeWithDelta } from '../../../../../utils/format.size';
import { TASK_STATUS_ICON } from '../../../../../modules/task/icons';

import type { BasePackage } from '../../../../../modules/packages/base-package';
import type { Task } from '../../../../../modules/task/task';

export function bundleSizeTask(extension: BasePackage, args: Record<string, any>): Task
{
	return {
		title: 'Bundle size',
		run: async (context) => {
			context.succeed('Bundle size');

			const bundleSize = extension.getBundlesSize();
			const previousSizes = context.previousResult as { previousJsSize: number | null; previousCssSize: number | null } | undefined;

			if (bundleSize.js > 0)
			{
				const formattedJsSize = formatSizeWithDelta(bundleSize.js, previousSizes?.previousJsSize ?? null);
				context.log(`    ${TASK_STATUS_ICON.arrowRight} JS: ${formattedJsSize}`);
			}

			if (bundleSize.css > 0)
			{
				const formattedCssSize = formatSizeWithDelta(bundleSize.css, previousSizes?.previousCssSize ?? null);
				context.log(`    ${TASK_STATUS_ICON.arrowRight} CSS: ${formattedCssSize}`);
			}

			if (bundleSize.js > 0 && bundleSize.css > 0)
			{
				const formattedTotalSize = formatSize({
					size: bundleSize.js + bundleSize.css,
					decimals: 1,
				});

				context.log(`    ${TASK_STATUS_ICON.arrowRight} Total: ${formattedTotalSize}`);
			}

			return previousSizes;
		},
	};
}
