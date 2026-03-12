import { createReporter } from '../create-reporter';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult, TaskDetail } from '../../../modules/task/task-types';

export function runEndToEndTestsTask(extension: BasePackage, args: Record<string, any>): Task
{
	return {
		title: 'E2E tests',
		run: async (): Promise<TaskResult> => {
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

				const details: TaskDetail[] = testResult.errors.map((error: Error) => ({
					type: 'error' as const,
					message: error.message,
					stack: error.stack,
				}));
				console.log('');

				return {
					title: 'E2E tests',
					status: 'failed',
					details,
				};
			}

			if (testResult.report.length === 0)
			{
				reporter.stop();

				return {
					title: 'No E2E tests found',
					status: 'warning',
				};
			}

			const { failed } = reporter.finish(testResult.consoleLogs);

			return {
				title: 'E2E tests',
				status: failed === 0 ? 'passed' : 'failed',
			};
		},
	};
}
