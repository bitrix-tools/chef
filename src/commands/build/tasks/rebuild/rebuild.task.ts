import chalk from 'chalk';
import type { Task } from '../../../../modules/task/task';
import type { BasePackage } from '../../../../modules/packages/base-package';
import { PackageResolver } from '../../../../modules/packages/package.resolver';
import { TASK_STATUS_ICON } from '../../../../modules/task/icons';

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
		run: async (context) => {
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
					const result = await target.build({ production: args.production });
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

			if (hasFailed)
			{
				context.fail(`Rebuild (${rebuild.join(', ')})`);
			}
			else if (hasWarnings)
			{
				context.warn(`Rebuild (${rebuild.join(', ')})`);
			}
			else
			{
				context.succeed(`Rebuild (${rebuild.join(', ')})`);
			}

			for (const r of results)
			{
				const icon = r.status === 'fail'
					? chalk.red(TASK_STATUS_ICON.fail)
					: r.status === 'warn'
						? chalk.yellow(TASK_STATUS_ICON.warning)
						: chalk.green(TASK_STATUS_ICON.success);
				context.log(`  ${icon} ${r.name}`);
			}
		},
	};
}
