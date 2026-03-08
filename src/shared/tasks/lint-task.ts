import type { BasePackage } from '../../modules/packages/base-package';
import type { Task } from '../../modules/task/task';
import { summaryFormatter } from '../../modules/engines/lint/summary-formatter';
import { verboseFormatter } from '../../modules/engines/lint/verbose-formatter';

export function lintTask(extension: BasePackage, args?: Record<string, any>): Task
{
	return {
		title: 'ESLint analysis...',
		run: async (context) => {
			const result = await extension.lint();
			const { text, title, level } = (() => {
				if (args?.verbose)
				{
					const verboseResult = verboseFormatter(result);
					const summaryResult = summaryFormatter(result);

					return {
						level: verboseResult.level,
						text: verboseResult.text,
						title: summaryResult.title,
					};
				}

				return summaryFormatter(result);
			})();

			context[level](title);

			if (text && text.length > 0)
			{
				context.border(text, null, 3);
			}
		},
	};
}
