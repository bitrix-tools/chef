import { buildSuiteTree } from '../../../modules/engines/test/test-report-renderer';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult } from '../../../modules/task/task-types';

export function e2eTestsTask(extension: BasePackage): Task
{
	return {
		title: 'Run E2E tests...',
		run: async (): Promise<TaskResult> => {
			const endToEndTests = await extension.getEndToEndTests();
			if (endToEndTests.length === 0)
			{
				return {
					title: 'No E2E tests found',
					status: 'warning',
				};
			}

			const testResult = await extension.runEndToEndTests();

			if (testResult.errors.length > 0)
			{
				return {
					title: 'E2E tests failed',
					status: 'failed',
				};
			}

			if (testResult.report.length === 0)
			{
				return {
					title: 'No E2E tests found',
					status: 'warning',
				};
			}

			const tree = buildSuiteTree(testResult.report);

			return {
				title: tree.failed > 0 ? 'E2E tests failed' : 'E2E tests passed',
				status: tree.failed > 0 ? 'failed' : 'passed',
			};
		},
	};
}
