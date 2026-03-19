import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';

import { fileExistsAsync } from './file-exists-async';

export enum SaveFileStatus {
	CREATED = 'created',
	REPLACED = 'replaced',
	CANCELLED = 'cancelled',
}

export type SafeFileWriteOptions = {
	filePath: string;
	data?: any;
	mode?: number;
	theme?: any;
	onConfirm?: (filename: string) => Promise<boolean>;
};

export async function safeFileWrite(options: SafeFileWriteOptions): Promise<SaveFileStatus>
{
	const { filePath, data, mode, theme, onConfirm } = options;
	const filename = path.basename(filePath);

	if (await fileExistsAsync(filePath))
	{
		const isReplaced = onConfirm
			? await onConfirm(filename)
			: await confirm({
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
			await fs.writeFile(filePath, data, mode !== undefined ? { mode } : undefined);
			return SaveFileStatus.REPLACED;
		}

		return SaveFileStatus.CANCELLED;
	}

	await fs.writeFile(filePath, data);

	console.log(`  ${chalk.green('✔')} → ${filename} — created successfully.`);

	return SaveFileStatus.CREATED;
}
