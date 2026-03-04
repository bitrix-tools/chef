import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import type { Task } from '../../../../modules/task/task';
import type { BasePackage } from '../../../../modules/packages/base-package';
import type { RollupLog } from 'rollup';
import { directDependenciesTask } from '../statistic/tasks/direct.dependencies.task';
import { dependenciesTreeTask } from '../statistic/tasks/dependencies.tree.task';
import { bundleSizeTask } from '../statistic/tasks/bundle.size.task';
import { totalTransferredSizeTask } from '../statistic/tasks/total.transferred.size.task';

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

function formatWarning(warning: RollupLog): string
{
	const lines: string[] = [];

	// Add warning code if available
	if (warning.code)
	{
		lines.push(chalk.yellow.bold(warning.code));
	}

	// Format the message - wrap long lines
	const message = warning.message;
	const maxLineLength = 80;

	if (message.length > maxLineLength)
	{
		const words = message.split(' ');
		let currentLine = '';

		for (const word of words)
		{
			if (currentLine.length + word.length + 1 > maxLineLength)
			{
				lines.push(chalk.yellow(currentLine.trim()));
				currentLine = word;
			}
			else
			{
				currentLine += (currentLine ? ' ' : '') + word;
			}
		}

		if (currentLine)
		{
			lines.push(chalk.yellow(currentLine.trim()));
		}
	}
	else
	{
		lines.push(chalk.yellow(message));
	}

	// Add location info
	if (warning.loc?.file)
	{
		const location = `${warning.loc.file}:${warning.loc.line}:${warning.loc.column}`;
		lines.push(chalk.dim(location));
	}

	return lines.join('\n');
}

export function buildTask(extension: BasePackage, args: Record<string, any>): Task
{
	// Get previous sizes before build
	const previousJsSize = getFileSize(extension.getOutputJsPath());
	const previousCssSize = getFileSize(extension.getOutputCssPath());

	return {
		title: 'Building code...',
		run: async (context) => {
			const result = await extension.build();

			if (result.errors.length > 0)
			{
				context.fail('Build failed');
				result.errors.forEach((error) => {
					context.border(error.message, 'red', 2);
					if (error.frame)
					{
						context.border(error?.frame, 'red', 2);
					}
				});

				return { previousJsSize, previousCssSize };
			}

			if (result.warnings.length > 0)
			{
				context.warn(`Build completed with ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}`);
				result.warnings.forEach((warning) => {
					context.border(formatWarning(warning), 'yellow', 3);
				});
			}
			else
			{
				context.succeed('Build successfully');
			}

			return { previousJsSize, previousCssSize };
		},
		subtasks: [
			bundleSizeTask(extension, args),
			totalTransferredSizeTask(extension, args),
			directDependenciesTask(extension, args),
			dependenciesTreeTask(extension, args),
		],
	};
}
