import * as path from 'node:path';

import { LintStrategy } from '../lint-strategy';
import { FileFinder } from '../../../../utils/file-finder';

import type { LintOptions, LintResult, LintFileResult } from '../lint-types';

const FLAT_CONFIG_FILES = [
	'eslint.config.js',
	'eslint.config.mjs',
	'eslint.config.cjs',
	'eslint.config.ts',
	'eslint.config.mts',
	'eslint.config.cts',
];

function findConfigFile(fromDir: string, rootDir: string): string | null
{
	for (const fileName of FLAT_CONFIG_FILES)
	{
		const filePath = FileFinder.findUpFile({ fileName, fromDir, rootDir });
		if (filePath)
		{
			return filePath;
		}
	}

	return null;
}

const EMPTY_RESULT: LintResult = {
	files: [],
	skipped: true,
	hasErrors: () => false,
	getErrorsCount: () => 0,
	hasWarnings: () => false,
	getWarningsCount: () => 0,
};

export class ESLintStrategy extends LintStrategy
{
	match(options: LintOptions): boolean
	{
		return findConfigFile(options.sourcePath, options.rootPath) !== null;
	}

	async lint(options: LintOptions): Promise<LintResult>
	{
		const configFile = findConfigFile(options.sourcePath, options.rootPath);

		if (!configFile)
		{
			return {
				...EMPTY_RESULT,
				skipReason: 'No eslint.config.js found',
			};
		}

		const configDir = path.dirname(configFile);
		const { ESLint } = await import('eslint');

		const eslint = new ESLint({
			errorOnUnmatchedPattern: false,
			cwd: configDir,
			overrideConfigFile: configFile,
			fix: options.fix ?? false,
			cache: options.cache ?? true,
			cacheLocation: path.join(configDir, '.eslintcache'),
		});

		const patterns = options.files && options.files.length > 0
			? options.files
			: [path.join(options.sourcePath, '**/*.{js,ts}')];

		const results = await eslint.lintFiles(patterns);

		if (options.fix)
		{
			await ESLint.outputFixes(results);
		}

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
