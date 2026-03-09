import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task } from '../../../modules/task/task';
import { TestReporter } from '../../../modules/engines/test/test-reporter';

export function runEndToEndTestsTask(extension: BasePackage, args: Record<string, any>): Task
{
	return {
		title: 'E2E tests',
		run: async (context): Promise<any> => {
			const testResult = await extension.runEndToEndTests(args);

			if (testResult.errors.length > 0)
			{
				context.fail('E2E tests');

				testResult.errors.forEach((error: Error) => {
					context.border(error.message, 'red', 2);
				});
				console.log('');
				return false;
			}

			if (testResult.report.length === 0)
			{
				context.warn('No E2E tests found');
				return true;
			}

			context.succeed('E2E tests');

			const reporter = new TestReporter();
			for (const token of testResult.report)
			{
				reporter.handleToken(token);
			}

			const { failed } = reporter.finish(testResult.consoleLogs);

			return failed === 0;
		},
	};
}
