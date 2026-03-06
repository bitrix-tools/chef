import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { TaskRunner } from '../../../modules/task/task';
import { BasePackage } from '../../../modules/packages/base-package';
import { formatSizeWithDelta } from '../../../utils/format.size';

function getFileSize(filePath: string): number | null
{
	try
	{
		if (fs.existsSync(filePath))
		{
			return fs.statSync(filePath).size;
		}
	}
	catch
	{
		// Ignore errors
	}

	return null;
}

export function plainBuild(extension: BasePackage, args: Record<string, any>): Promise<any>
{
	const name = extension.getName();

	// Get previous sizes before build
	const jsPath = extension.getOutputJsPath();
	const cssPath = extension.getOutputCssPath();
	const previousJsSize = getFileSize(jsPath);
	const previousCssSize = getFileSize(cssPath);

	return TaskRunner.runTask({
		title: chalk.bold(name),
		run: async (context) => {
			const result = await extension.build({ production: args.production });

			if (result.errors.length > 0)
			{
				context.fail(chalk.bold(name));

				result.errors.forEach((error) => {
					context.border(error.message, 'red', 2);
					if (error.frame)
					{
						context.border(error?.frame, 'red', 2);
					}
				});

				return;
			}

			if (result.warnings.length > 0)
			{
				context.warn(chalk.bold(name));
			}
			else
			{
				context.succeed(chalk.bold(name));
			}

			// Show bundle sizes (read from disk to get actual sizes including CSS)
			const currentJsSize = getFileSize(jsPath);
			const currentCssSize = getFileSize(cssPath);

			if (currentJsSize !== null)
			{
				const jsFileName = path.basename(jsPath);
				const sizeInfo = formatSizeWithDelta(currentJsSize, previousJsSize);
				context.log(`  ${chalk.dim('└─')} ${jsFileName}  ${sizeInfo}`);
			}

			if (currentCssSize !== null)
			{
				const cssFileName = path.basename(cssPath);
				const sizeInfo = formatSizeWithDelta(currentCssSize, previousCssSize);
				context.log(`  ${chalk.dim('└─')} ${cssFileName}  ${sizeInfo}`);
			}

			// Show warnings after sizes
			if (result.warnings.length > 0)
			{
				result.warnings.forEach((error) => {
					context.border(error.message, 'yellow', 2);
					if (error.frame)
					{
						context.border(error?.frame, 'yellow', 2);
					}
				});
			}
		},
	});
}
