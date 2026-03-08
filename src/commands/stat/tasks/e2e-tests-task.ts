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
			}
			else
			{
				const { status } = await extension.runEndToEndTests();
				if (status === 'TESTS_PASSED')
				{
					context.succeed('E2E tests passed');
				}

				if (status === 'TESTS_FAILED')
				{
					context.fail('E2E tests failed');
				}
			}
		},
	};
}
