import { TaskRunner } from '../../../modules/task/task-runner';
import { getFileSize } from '../../../utils/get-file-size';
import { lintTask } from '../../../shared/tasks/lint-task';
import { buildTask } from '../tasks/build-task';
import { rebuildTask } from '../tasks/rebuild-task';
import { bundleSizeTask } from '../../../shared/tasks/bundle-size-task';
import { totalTransferredSizeTask } from '../../../shared/tasks/total-transferred-size-task';
import { directDependenciesTask } from '../../../shared/tasks/direct-dependencies-task';
import { dependenciesTreeTask } from '../../../shared/tasks/dependencies-tree-task';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task } from '../../../modules/task/task-types';

export function verboseBuild(extension: BasePackage, args: Record<string, any>): Promise<any>
{
	const previousJsSize = getFileSize(extension.getOutputJsPath());
	const previousCssSize = getFileSize(extension.getOutputCssPath());

	const tasks: Task[] = [
		lintTask(extension, args),
		buildTask(extension, args),
		bundleSizeTask(extension, { previousJsSize, previousCssSize }),
		totalTransferredSizeTask(extension),
		directDependenciesTask(extension),
		dependenciesTreeTask(extension),
		rebuildTask(extension, args),
	].filter((task): task is Task => task !== null);

	return TaskRunner.run({
		title: extension.getName(),
		tasks,
	});
}
