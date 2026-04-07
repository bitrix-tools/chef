import * as path from 'node:path';

import chalk from 'chalk';

import { TaskRunner } from '../../../modules/task/task-runner';
import { formatSizeWithDelta } from '../../../utils/format-size';
import { getFileSize } from '../../../utils/get-file-size';
import { rebuildTask } from '../tasks/rebuild-task';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult, TaskDetail, TaskGroupResult } from '../../../modules/task/task-types';

export function plainBuild(extension: BasePackage, args: Record<string, any>): Promise<TaskGroupResult>
{
	const name = extension.getName();

	const jsPath = extension.getOutputJsPath();
	const cssPath = extension.getOutputCssPath();
	const previousJsSize = getFileSize(jsPath);
	const previousCssSize = getFileSize(cssPath);

	const plainBuildTask: Task = {
		title: `Building ${name}...`,
		run: async (): Promise<TaskResult> => {
			const result = await extension.build({ production: args.production });

			const root = extension.getPath();
			const relativeRoot = path.relative(process.cwd(), root);
			const pathPrefix = relativeRoot ? relativeRoot + '/' : '';

			if (result.errors.length > 0)
			{
				const details: TaskDetail[] = [
					...result.errors.map((error) => ({
						type: 'error' as const,
						severity: 'error' as const,
						code: error.code,
						message: error.message.replace(/^\[plugin [^\]]+\]\s*/, '').replaceAll(pathPrefix, ''),
						frame: error.frame,
						loc: error.loc?.file
							? { file: error.loc.file, line: error.loc.line, column: error.loc.column, root }
							: undefined,
						risk: error.risk,
						gapInfo: error.gapInfo,
					})),
					...result.warnings.map((warning) => ({
						type: 'error' as const,
						severity: 'warning' as const,
						code: warning.code,
						message: warning.message.replace(/^\[plugin [^\]]+\]\s*/, '').replaceAll(pathPrefix, ''),
						frame: warning.frame,
						loc: warning.loc?.file
							? { file: warning.loc.file, line: warning.loc.line, column: warning.loc.column, root }
							: undefined,
						risk: warning.risk,
						gapInfo: warning.gapInfo,
					})),
				];

				return {
					title: chalk.bold(name),
					status: 'failed',
					details,
				};
			}

			const details: TaskDetail[] = [];

			const currentJsSize = getFileSize(jsPath);
			const currentCssSize = getFileSize(cssPath);

			if (currentJsSize !== null)
			{
				const jsFileName = path.basename(jsPath);
				const sizeInfo = formatSizeWithDelta(currentJsSize, previousJsSize);
				details.push({ type: 'item', text: `${jsFileName}  ${sizeInfo}` });
			}

			if (currentCssSize !== null)
			{
				const cssFileName = path.basename(cssPath);
				const sizeInfo = formatSizeWithDelta(currentCssSize, previousCssSize);
				details.push({ type: 'item', text: `${cssFileName}  ${sizeInfo}` });
			}

			if (result.warnings.length > 0)
			{
				for (const warning of result.warnings)
				{
					details.push({
						type: 'error',
						severity: 'warning',
						code: warning.code,
						message: warning.message.replace(/^\[plugin [^\]]+\]\s*/, '').replaceAll(pathPrefix, ''),
						frame: warning.frame,
						loc: warning.loc?.file
							? { file: warning.loc.file, line: warning.loc.line, column: warning.loc.column, root }
							: undefined,
						risk: warning.risk,
						gapInfo: warning.gapInfo,
					});
				}

				return {
					title: chalk.bold(name),
					status: 'warning',
					details: details.length > 0 ? details : undefined,
				};
			}

			return {
				title: chalk.bold(name),
				status: 'passed',
				details: details.length > 0 ? details : undefined,
			};
		},
	};

	const tasks: Task[] = [
		plainBuildTask,
		rebuildTask(extension, args),
	].filter((task): task is Task => task !== null);

	return TaskRunner.run({
		title: name,
		tasks,
	});
}
