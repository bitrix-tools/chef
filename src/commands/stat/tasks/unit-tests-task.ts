import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult } from '../../../modules/task/task-types';

export function unitTestsTask(extension: BasePackage): Task
{
	return {
		title: 'Run unit tests...',
		run: async (): Promise<TaskResult> => {
			const testsResult = await extension.runUnitTests();

			if (testsResult.errors.length > 0)
			{
				return {
					title: `Run unit tests failed --> Run chef test -e=${extension.getName()} for more information`,
					status: 'failed',
				};
			}

			const stats = testsResult.report.reduce((acc, item) => {
				if (item.id === 'TEST_PASSED')
				{
					acc.passed++;
				}

				if (item.id === 'TEST_FAILED')
				{
					acc.failed++;
				}

				return acc;
			}, { passed: 0, failed: 0 });

			if (stats.passed === 0 && stats.failed === 0)
			{
				return {
					title: 'No unit tests found',
					status: 'warning',
				};
			}

			if (stats.failed > 0)
			{
				return {
					title: `Unit tests failed --> Run chef test -e=${extension.getName()} for more information.`,
					status: 'failed',
				};
			}

			return {
				title: 'Unit tests passed',
				status: 'passed',
			};
		},
	};
}
