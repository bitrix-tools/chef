import chalk from 'chalk';

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
					title: `Unit tests failed — run ${chalk.cyan(`chef test ${extension.getName()}`)} for details`,
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
					status: 'skipped',
				};
			}

			if (stats.failed > 0)
			{
				return {
					title: `Unit tests failed — run ${chalk.cyan(`chef test ${extension.getName()}`)} for details`,
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
