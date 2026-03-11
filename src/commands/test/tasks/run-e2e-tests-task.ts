import { createReporter } from '../create-reporter';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task } from '../../../modules/task/task';

export function runEndToEndTestsTask(extension: BasePackage, args: Record<string, any>): Task
{
	return {
		title: 'E2E tests',
		run: async (context): Promise<any> => {
			context.succeed('E2E tests');

			const reporter = createReporter(args.reporter);

			const testResult = await extension.runEndToEndTests({
				...args,
				onToken: (token, browser) => reporter.handleToken(token, browser),
				onStatus: (status: string) => reporter.updateStatus(status),
				onBegin: ({ browserCount }) => reporter.setBrowserCount(browserCount),
			});

			if (testResult.errors.length > 0)
			{
				reporter.stop();

				testResult.errors.forEach((error: Error) => {
					context.border(error.message, 'red', 2);
				});
				console.log('');
				return false;
			}

			if (testResult.report.length === 0)
			{
				reporter.stop();
				context.warn('No E2E tests found');
				return true;
			}

			const { failed } = reporter.finish(testResult.consoleLogs);

			return failed === 0;
		},
	};
}
