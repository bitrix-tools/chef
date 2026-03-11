import { buildSuiteTree } from '../../../modules/engines/test/test-report-renderer';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task } from '../../../modules/task/task';

export function e2eTestsTask(extension: BasePackage): Task
{
	return {
		title: 'Run E2E tests...',
		run: async (context) => {
			const endToEndTests = await extension.getEndToEndTests();
			if (endToEndTests.length === 0)
			{
				context.warn('No E2E tests found');
				return;
			}

			const testResult = await extension.runEndToEndTests();

			if (testResult.errors.length > 0)
			{
				context.fail('E2E tests failed');
				return;
			}

			if (testResult.report.length === 0)
			{
				context.warn('No E2E tests found');
				return;
			}

			const tree = buildSuiteTree(testResult.report);
			if (tree.failed > 0)
			{
				context.fail('E2E tests failed');
			}
			else
			{
				context.succeed('E2E tests passed');
			}
		},
	};
}
