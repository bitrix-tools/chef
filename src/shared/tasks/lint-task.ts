import type { BasePackage } from '../../modules/packages/base-package';
import type { Task } from '../../modules/task/task';
import { summaryFormatter } from '../../modules/formatters/lint/summary-formatter';

export function lintTask(extension: BasePackage, args?: Record<string, any>): Task
{
	return {
		title: 'ESLint analysis...',
		run: async (context) => {
			const result = await extension.lint();
			const { text, title, level } = await (async () => {
				if (args?.verbose)
				{
					const { verboseFormatter } = await import('../../modules/formatters/lint/verbose-formatter');
					const verboseResult = await verboseFormatter(result);
					const summaryResult = await summaryFormatter(result);

					return {
						level: verboseResult.level,
						text: verboseResult.text,
						title: summaryResult.title,
					};
				}

				return await summaryFormatter(result);
			})();

			context[level](title);

			if (text && text.length > 0)
			{
				context.border(text, null, 3);
			}
		},
	};
}
