import chalk from 'chalk';
import table from 'text-table';

import type { LintResult, LintFormatterLevel, LintMessage } from './lint-types';

function truncateWords(str: string, maxLength: number): string
{
	if (str.length <= maxLength)
	{
		return str;
	}

	const truncated = str.substring(0, maxLength);

	return truncated.replace(/\s+\S*$/, '') + '...';
}

function getLevelIcon(severity: LintMessage['severity']): string
{
	if (severity === 'error')
	{
		return chalk.red('✖');
	}

	return chalk.yellow('⚠');
}

export function verboseFormatter(result: LintResult): { text: string; level: LintFormatterLevel }
{
	const level: LintFormatterLevel = (() => {
		if (result.hasErrors())
		{
			return 'fail';
		}

		if (result.hasWarnings())
		{
			return 'warn';
		}

		return 'succeed';
	})();

	const text = result.files
		.filter((file) => file.messages.length > 0)
		.map((file) => {
			const head = `${chalk.bold(file.filePath.split('/src/')[1])}`;
			const messages = table(
				file.messages.map((message) => {
					return [
						` ${getLevelIcon(message.severity)}`,
						`${message.line}:${message.column}`,
						message.ruleId ?? '',
						truncateWords(message.message, 60),
					];
				}),
				{
					align: ['l', 'l', 'l'],
				},
			);

			return `${head}\n${messages}`;
		}).join('\n');

	return {
		level,
		text,
	};
}
