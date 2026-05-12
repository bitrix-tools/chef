import * as path from 'node:path';

import { normalizePath } from '../../../utils/path/normalize';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult, TaskDetail } from '../../../modules/task/task-types';
import type { BuildDiagnostic } from '../../../modules/engines/build/build-types';

function shortenPaths(message: string, relativeRoot: string): string
{
	if (!relativeRoot)
	{
		return message;
	}

	const prefix = normalizePath(relativeRoot).endsWith('/') ? normalizePath(relativeRoot) : normalizePath(relativeRoot) + '/';

	return normalizePath(message).replaceAll(prefix, '');
}

function diagnosticToDetail(log: BuildDiagnostic, root: string, relativeRoot: string, severity?: 'error' | 'warning'): TaskDetail
{
	const loc = log.loc?.file
		? { file: log.loc.file, line: log.loc.line, column: log.loc.column, root }
		: undefined;

	const rawMessage = log.message.replace(/^\[plugin [^\]]+\]\s*/, '');

	return {
		type: 'error',
		code: log.code,
		severity,
		message: shortenPaths(rawMessage, relativeRoot),
		frame: log.frame,
		loc,
		risk: log.risk,
		gapInfo: log.gapInfo,
	};
}

export function buildTask(extension: BasePackage, args: Record<string, any>): Task
{
	return {
		title: 'Building code...',
		run: async (onUpdate): Promise<TaskResult> => {
			const result = await extension.build({ force: args.force });

			const root = extension.getPath();
			const relativeRoot = path.relative(process.cwd(), root);

			if (result.errors.length > 0)
			{
				const details = [
					...result.errors.map((log) => diagnosticToDetail(log, root, relativeRoot, 'error')),
					...result.warnings.map((log) => diagnosticToDetail(log, root, relativeRoot, 'warning')),
				];

				return {
					title: 'Build failed',
					status: 'failed',
					details,
				};
			}

			if (result.warnings.length > 0)
			{
				return {
					title: `Build completed with ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}`,
					status: 'warning',
					details: result.warnings.map((log) => diagnosticToDetail(log, root, relativeRoot, 'warning')),
				};
			}

			return {
				title: 'Build completed',
				status: 'passed',
			};
		},
	};
}
