import { createReporter } from '../create-reporter';
import { checkCredentialsWarning } from '../check-env-test';
import { getModuleTests, getModuleTestsDirectory, runModuleEndToEndTests } from '../module-tests-dir';

import type { Task, TaskResult, TaskDetail } from '../../../modules/task/task-types';
import type { TestToken } from '../../../modules/engines/test/test-types';

/**
 * Runs a module's scenario (cross-extension) e2e tests from
 * `<module>/tests/chef/e2e/`. Mirrors run-e2e-tests-task, but the unit of work is
 * a module directory rather than a single extension (BasePackage).
 */
export function runModuleTestsTask(moduleName: string, args: Record<string, any>): Task
{
	return {
		title: 'E2E tests',
		run: async (onUpdate): Promise<TaskResult> => {
			checkCredentialsWarning(getModuleTestsDirectory(moduleName));

			const reporter = createReporter(args.reporter, onUpdate, { showSummary: false });

			const testResult = await runModuleEndToEndTests(moduleName, {
				...args,
				onToken: (token: TestToken, browser?: string) => reporter.handleToken(token, browser),
				onStatus: (status: string) => reporter.updateStatus(status),
				onBegin: ({ browserCount, totalTests, browsers }: { browserCount: number; totalTests: number; browsers?: string[] }) => {
					reporter.setBrowserCount(browserCount);
					reporter.setTotalTests(totalTests);
					if (browsers && browsers.length > 0)
					{
						reporter.setBrowsers(browsers);
					}
				},
			});

			if (testResult.errors.length > 0)
			{
				reporter.stop();
				reporter.clearStatus();

				const details: TaskDetail[] = testResult.errors.map((error: Error) => ({
					type: 'error' as const,
					code: 'code' in error ? (error as any).code : undefined,
					message: error.message,
					stack: error.stack,
				}));

				return {
					title: 'E2E tests (errored)',
					status: 'failed',
					details,
				};
			}

			if (testResult.report.length === 0)
			{
				reporter.stop();
				reporter.clearStatus();

				const hasFiles = (await getModuleTests(moduleName)).length > 0;

				return {
					title: hasFiles ? 'E2E tests (no tests collected)' : 'E2E tests (no test files)',
					status: 'skipped',
				};
			}

			const { passed, failed, failures, browsers } = reporter.finish(args.console ? testResult.consoleLogs : []);

			const title = failed === 0 ? 'E2E tests' : `E2E tests (${failed} failed)`;

			return {
				title,
				status: failed === 0 ? 'passed' : 'failed',
				metrics: { passed, failed, failures, browsers },
			};
		},
	};
}
