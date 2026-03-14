import * as path from 'node:path';

import chalk from 'chalk';

import { TaskRunner } from '../../../modules/task/task-runner';
import { pluralize } from '../../../utils/pluralize';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult, TaskDetail } from '../../../modules/task/task-types';

type LintCommandOptions = {
	fix?: boolean;
	files?: string[];
};

export function lint(extension: BasePackage, options: LintCommandOptions = {}): () => Promise<any>
{
	return async () => {
		const name = extension.getName();
		const root = extension.getPath();
		const files = options.files?.map((pattern) => {
			return path.isAbsolute(pattern) ? pattern : path.join(root, pattern);
		});

		const lintTask: Task = {
			title: `Linting ${name}...`,
			run: async (): Promise<TaskResult> => {
				const result = await extension.lint({
					fix: options.fix,
					files,
				});

				if (result.skipped)
				{
					return {
						title: `${chalk.bold(name)} ${chalk.dim(`— ${result.skipReason}`)}`,
						status: 'passed',
					};
				}

				if (!result.hasErrors() && !result.hasWarnings())
				{
					const suffix = options.fix ? chalk.dim(' (fixed)') : '';

					return {
						title: `${chalk.bold(name)}${suffix}`,
						status: 'passed',
					};
				}

				const details: TaskDetail[] = [];

				const filesWithMessages = result.files.filter((file) => file.messages.length > 0);

				for (const file of filesWithMessages)
				{
					for (const message of file.messages)
					{
						details.push({
							type: 'error',
							severity: message.severity === 'warning' ? 'warning' : 'error',
							code: message.ruleId ?? undefined,
							message: message.message.trim(),
							loc: {
								file: file.filePath,
								line: message.line,
								column: message.column,
								root,
							},
						});
					}
				}

				const errorsCount = result.getErrorsCount();
				const warningsCount = result.getWarningsCount();

				const parts: string[] = [];
				if (errorsCount > 0)
				{
					parts.push(pluralize(' error', errorsCount));
				}
				if (warningsCount > 0)
				{
					parts.push(pluralize(' warning', warningsCount));
				}

				const suffix = options.fix ? ', after fix' : '';
				const title = `${chalk.bold(name)} ${chalk.dim(`(${parts.join(', ')}${suffix})`)}`;

				return {
					title,
					status: result.hasErrors() ? 'failed' : 'warning',
					details,
				};
			},
		};

		return TaskRunner.run({
			title: name,
			tasks: [lintTask],
		});
	};
}
