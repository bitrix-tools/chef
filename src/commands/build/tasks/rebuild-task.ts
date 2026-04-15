import chalk from 'chalk';

import { PackageResolver } from '../../../modules/packages/package-resolver';

import type { Task, TaskResult, TaskDetail } from '../../../modules/task/task-types';
import type { BasePackage } from '../../../modules/packages/base-package';

type RebuildResult = {
	name: string;
	status: 'ok' | 'warn' | 'fail';
};

export function rebuildTask(extension: BasePackage, args: Record<string, any>): Task | null
{
	const rebuild = extension.getBundleConfig().get('rebuild');
	if (!Array.isArray(rebuild) || rebuild.length === 0)
	{
		return null;
	}

	return {
		title: `Rebuild (${rebuild.join(', ')})`,
		run: async (): Promise<TaskResult> => {
			const results: RebuildResult[] = [];

			for (const extensionName of rebuild)
			{
				const target = PackageResolver.resolve(extensionName);
				if (!target)
				{
					results.push({ name: extensionName, status: 'fail' });
					continue;
				}

				try
				{
					const result = await target.build({ force: args.force });
					if (result.errors.length > 0)
					{
						results.push({ name: target.getName(), status: 'fail' });
					}
					else if (result.warnings.length > 0)
					{
						results.push({ name: target.getName(), status: 'warn' });
					}
					else
					{
						results.push({ name: target.getName(), status: 'ok' });
					}
				}
				catch
				{
					results.push({ name: target.getName(), status: 'fail' });
				}
			}

			const hasFailed = results.some((r) => r.status === 'fail');
			const hasWarnings = results.some((r) => r.status === 'warn');

			const details: TaskDetail[] = results.map((r) => {
				const icon = r.status === 'fail'
					? chalk.red('✗')
					: r.status === 'warn'
						? chalk.yellow('○')
						: chalk.green('✓');

				return { type: 'item', text: `${icon} ${r.name}` };
			});

			const status = hasFailed ? 'failed' : hasWarnings ? 'warning' : 'passed';

			return {
				title: `Rebuild (${rebuild.join(', ')})`,
				status,
				details,
			};
		},
	};
}
