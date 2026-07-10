import { createReporter } from '../create-reporter';
import { checkCredentialsWarning } from '../check-env-test';
import { showsBrowserConsole, showsNodeOutput } from '../console-target';
import { extensionTarget, runE2eForTarget } from '../e2e-target';

import type { E2eTarget } from '../e2e-target';
import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult, TaskDetail } from '../../../modules/task/task-types';

/**
 * One e2e task for any target — a single extension or a module's scenario suite. Both used
 * to have their own near-identical copy of this; now they share it via E2eTarget, so error
 * handling, the "no tests" case, console output and metrics behave identically.
 */
export function createE2eTestsTask(target: E2eTarget, args: Record<string, any>): Task
{
	return {
		title: 'E2E tests',
		run: async (onUpdate): Promise<TaskResult> => {
			const reporter = createReporter(args.reporter, onUpdate, { showSummary: false });

			// Cheap up-front check: no e2e test files means nothing to run, so skip before the
			// credentials warning and any Playwright work (also short-circuits --list).
			if ((await target.listTests()).length === 0)
			{
				return { title: 'E2E tests (no test files)', status: 'skipped' };
			}

			// --list: enumerate tests, print them, and stop — no auth check, no run.
			if (args.list)
			{
				const listResult = await runE2eForTarget(target, {
					...args,
					listOnly: true,
					onToken: (token, browser) => reporter.handleToken(token, browser),
				});
				reporter.stop();
				reporter.clearStatus();

				if (listResult.errors.length > 0)
				{
					return {
						title: 'E2E tests (errored)',
						status: 'failed',
						details: listResult.errors.map((error: Error) => ({
							type: 'error' as const,
							code: 'code' in error ? (error as any).code : undefined,
							message: error.message,
							stack: error.stack,
						})),
					};
				}

				const { listing } = reporter.finish();
				const listed = listResult.report.filter((token) => token.id === 'TEST_LISTED').length;

				return {
					title: listed > 0 ? 'E2E tests (listed)' : 'E2E tests (no test files)',
					status: 'skipped',
					metrics: listing ? { listing: { kind: 'e2e', ...listing } } : undefined,
				};
			}

			checkCredentialsWarning(target.path);

			const testResult = await runE2eForTarget(target, {
				...args,
				captureNodeOutput: showsNodeOutput(args.console),
				onToken: (token, browser) => reporter.handleToken(token, browser),
				onStatus: (status: string) => reporter.updateStatus(status),
				onBegin: ({ browserCount, totalTests, browsers }) => {
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

				const hasFiles = (await target.listTests()).length > 0;

				return {
					title: hasFiles ? 'E2E tests (no tests collected)' : 'E2E tests (no test files)',
					status: 'skipped',
				};
			}

			const { passed, failed, failures, browsers, flaky } = reporter.finish({
				consoleLogs: showsBrowserConsole(args.console) ? testResult.consoleLogs : [],
				nodeOutput: showsNodeOutput(args.console) ? testResult.nodeOutput : undefined,
			});

			const title = failed === 0
				? 'E2E tests'
				: `E2E tests (${failed} failed)`;

			return {
				title,
				status: failed === 0 ? 'passed' : 'failed',
				metrics: { passed, failed, failures, browsers, flaky },
			};
		},
	};
}

/** Extension e2e task — thin wrapper over the shared target-based task. */
export function runEndToEndTestsTask(extension: BasePackage, args: Record<string, any>): Task
{
	return createE2eTestsTask(extensionTarget(extension), args);
}
