import chalk from 'chalk';
import { TaskRunner } from '../../../modules/task/task';
import { BasePackage } from '../../../modules/packages/base-package';
import { lintTask } from '../tasks/lint/lint.task';
import { buildTask } from '../tasks/build/build.task';
import { rebuildTask } from '../tasks/rebuild/rebuild.task';

export function verboseBuild(extension: BasePackage, args: Record<string, any>): Promise<any>
{
	const name = extension.getName();

	const subtasks = [
		lintTask(extension, args),
		buildTask(extension, args),
		rebuildTask(extension, args),
	].filter(Boolean);

	return TaskRunner.run([
	{
		title: chalk.bold(name),
		run: () => {
			return Promise.resolve();
		},
		subtasks,
	}
]);
}
