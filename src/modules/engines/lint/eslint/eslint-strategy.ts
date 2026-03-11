import * as path from 'node:path';

import { LintStrategy } from '../lint-strategy';

import type { LintOptions, LintResult, LintFileResult } from '../lint-types';

export class ESLintStrategy extends LintStrategy
{
	async lint(options: LintOptions): Promise<LintResult>
	{
		const { ESLint } = await import('eslint');

		const eslint = new ESLint({
			errorOnUnmatchedPattern: false,
			cwd: options.rootPath,
		});

		const results = await eslint.lintFiles(
			path.join(options.sourcePath, '**/*.js'),
		);

		const files: LintFileResult[] = results.map((result) => ({
			filePath: result.filePath,
			messages: result.messages.map((message) => ({
				line: message.line,
				column: message.column,
				severity: message.severity === 2 ? 'error' as const : 'warning' as const,
				message: message.message,
				ruleId: message.ruleId ?? null,
			})),
		}));

		const errorsCount = results.reduce((sum, r) => sum + r.errorCount, 0);
		const warningsCount = results.reduce((sum, r) => sum + r.warningCount, 0);

		return {
			files,
			hasErrors: () => errorsCount > 0,
			getErrorsCount: () => errorsCount,
			hasWarnings: () => warningsCount > 0,
			getWarningsCount: () => warningsCount,
		};
	}
}
