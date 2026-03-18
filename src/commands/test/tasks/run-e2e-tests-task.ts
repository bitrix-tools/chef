import { createReporter } from '../create-reporter';
import { checkCredentialsWarning } from '../check-env-test';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult, TaskDetail } from '../../../modules/task/task-types';

export function runEndToEndTestsTask(extension: BasePackage, args: Record<string, any>): Task
{
	return {
		title: 'E2E tests',
		run: async (onUpdate): Promise<TaskResult> => {
			checkCredentialsWarning(extension.getPath());

			const reporter = createReporter(args.reporter, onUpdate);

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
					code: 'code' in error ? (error as any).code : undefined,
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
					title: 'E2E tests',
					status: 'skipped',
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
