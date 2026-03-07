import { verboseBuild } from './verbose.build';
import { plainBuild } from './plain.build';
import { BasePackage } from '../../../modules/packages/base-package';
import { PackageResolver } from '../../../modules/packages/package.resolver';
import chalk from 'chalk';
import { TASK_STATUS_ICON } from '../../../modules/task/icons';

async function runRebuild(extension: BasePackage, args: Record<string, any>): Promise<void>
{
	const rebuild = extension.getBundleConfig().get('rebuild');
	if (!Array.isArray(rebuild) || rebuild.length === 0)
	{
		return;
	}

	console.log(`  ${chalk.dim(TASK_STATUS_ICON.arrowDown)} ${chalk.dim('rebuild')}`);

	for (const extensionName of rebuild)
	{
		const target = PackageResolver.resolve(extensionName);
		if (!target)
		{
			console.log(`    ${chalk.red(TASK_STATUS_ICON.fail)} ${extensionName} ${chalk.dim('(not found)')}`);
			continue;
		}

		try
		{
			const result = await target.build({ production: args.production });
			if (result.errors.length > 0)
			{
				console.log(`    ${chalk.red(TASK_STATUS_ICON.fail)} ${target.getName()}`);
			}
			else if (result.warnings.length > 0)
			{
				console.log(`    ${chalk.yellow(TASK_STATUS_ICON.warning)} ${target.getName()}`);
			}
			else
			{
				console.log(`    ${chalk.green(TASK_STATUS_ICON.success)} ${target.getName()}`);
			}
		}
		catch
		{
			console.log(`    ${chalk.red(TASK_STATUS_ICON.fail)} ${target.getName()}`);
		}
	}
}

export function build(extension: BasePackage, args: Record<string, any>): () => Promise<any>
{
	return async () => {
		if (args.verbose)
		{
			return verboseBuild(extension, args);
		}

		await plainBuild(extension, args);
		await runRebuild(extension, args);
	};
}
