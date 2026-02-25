import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { confirm } from '@inquirer/prompts';
import { fileExistsAsync } from './file.exists.async';
import chalk from 'chalk';

export enum SaveFileStatus {
	CREATED = 'created',
	REPLACED = 'replaced',
	CANCELLED = 'cancelled',
}

export type SafeFileWriteOptions = {
	filePath: string;
	data?: any;
	theme?: any;
};

export async function safeFileWrite(options: SafeFileWriteOptions): Promise<SaveFileStatus>
{
	const { filePath, data, theme } = options;
	const filename = path.basename(filePath);

	if (await fileExistsAsync(filePath))
	{
		const isReplaced = await confirm({
			message: `File "${filename}" already exists. Overwrite?`,
			transformer: (value: boolean) => {
				if (value)
				{
					return `(Y)\n  → ${filename} overwritten successfully.`;
				}

				return `(N)\n  → Creation ${filename} canceled...`;
			},
			default: false,
			theme: theme,
		});

		if (isReplaced)
		{
			return SaveFileStatus.REPLACED;
		}

		return SaveFileStatus.CANCELLED;
	}

	await fs.writeFile(filePath, data);

	console.log(`  ${chalk.green('✔')} → ${filename} — created successfully.`);

	return SaveFileStatus.CREATED;
}
