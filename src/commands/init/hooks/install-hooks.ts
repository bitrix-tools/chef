import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

import { safeFileWrite, SaveFileStatus } from '../../../utils/safe-file-write';

const execFile = promisify(execFileCb);

export type HookFileResult = {
	name: string;
	status: SaveFileStatus;
};

export type InstallHooksResult = {
	files: HookFileResult[];
};

const scriptsDir = path.join(import.meta.dirname, 'scripts');

export async function hasGitRepo(rootPath: string): Promise<boolean>
{
	const gitDir = path.join(rootPath, '.git');

	return fs.access(gitDir).then(() => true, () => false);
}

type InstallOptions = {
	theme?: object;
	onConfirm?: (filename: string) => Promise<boolean>;
};

export async function installGitHooks(rootPath: string, options: InstallOptions = {}): Promise<InstallHooksResult>
{
	const hooksDir = path.join(rootPath, '.chef', 'hooks');
	await fs.mkdir(hooksDir, { recursive: true });

	const hooks: Record<string, string> = {
		'post-merge': 'git-post-merge.sh',
		'post-checkout': 'git-post-checkout.sh',
		'post-rewrite': 'git-post-rewrite.sh',
	};

	const files: HookFileResult[] = [];

	for (const [hookName, scriptFile] of Object.entries(hooks))
	{
		const script = await fs.readFile(path.join(scriptsDir, scriptFile), 'utf8');
		const hookPath = path.join(hooksDir, hookName);

		const status = await safeFileWrite({
			filePath: hookPath,
			data: script,
			mode: 0o755,
			...(options.theme ? { theme: options.theme } : {}),
			...(options.onConfirm ? { onConfirm: options.onConfirm } : {}),
		});

		files.push({ name: `.chef/hooks/${hookName}`, status });
	}

	await execFile('git', ['config', 'core.hooksPath', '.chef/hooks'], { cwd: rootPath });

	return { files };
}
