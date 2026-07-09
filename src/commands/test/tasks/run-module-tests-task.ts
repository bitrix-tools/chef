import { createE2eTestsTask } from './run-e2e-tests-task';
import { moduleTarget } from '../e2e-target';

import type { Task } from '../../../modules/task/task-types';

/**
 * Runs a module's scenario (cross-extension) e2e tests from `<module>/tests/chef/e2e/`.
 * A thin wrapper over the shared target-based e2e task — a module is just another E2eTarget.
 */
export function runModuleTestsTask(moduleName: string, args: Record<string, any>): Task
{
	return createE2eTestsTask(moduleTarget(moduleName), args);
}
