import { findCircularDependencies } from '../../../utils/package/find.circular.dependencies';
import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task } from '../../../modules/task/task';
import chalk from 'chalk';

export function circularDependenciesTask(extension: BasePackage): Task
{
	return {
		title: 'Circular dependencies',
		run: async (context) => {
			const cycles = await findCircularDependencies({ target: extension });

			if (cycles.length === 0)
			{
				context.succeed('No circular dependencies');
				return;
			}

			context.fail(`Found ${cycles.length} circular ${cycles.length === 1 ? 'dependency' : 'dependencies'}`);

			const rootName = extension.getName();
			for (const [depName] of cycles)
			{
				const formatted = `${chalk.red(rootName)} ${chalk.grey('→')} ${depName} ${chalk.grey('→')} ${chalk.red(rootName)}`;
				context.log(`    ${formatted}`);
			}
		},
	};
}