import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

import { safeFileWrite, SaveFileStatus } from '../../../utils/safe-file-write';

const execFile = promisify(execFileCb);

export type VcsType = 'git' | 'hg';

export type HookFileResult = {
	name: string;
	status: SaveFileStatus;
};

export type InstallHooksResult = {
	files: HookFileResult[];
};

const scriptsDir = path.join(import.meta.dirname, 'scripts');

export async function detectVcs(rootPath: string): Promise<VcsType | null>
{
	const gitDir = path.join(rootPath, '.git');
	const hgDir = path.join(rootPath, '.hg');

	const [gitExists, hgExists] = await Promise.all([
		fs.access(gitDir).then(() => true, () => false),
		fs.access(hgDir).then(() => true, () => false),
	]);

	if (gitExists)
	{
		return 'git';
	}

	if (hgExists)
	{
		return 'hg';
	}

	return null;
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

export async function installHgHooks(rootPath: string, options: InstallOptions = {}): Promise<InstallHooksResult>
{
	const hooksDir = path.join(rootPath, '.chef', 'hooks');
	await fs.mkdir(hooksDir, { recursive: true });

	const script = await fs.readFile(path.join(scriptsDir, 'hg-update-aliases.sh'), 'utf8');
	const hookScriptPath = path.join(hooksDir, 'update-aliases.sh');

	const scriptStatus = await safeFileWrite({
		filePath: hookScriptPath,
		data: script,
		mode: 0o755,
		...(options.theme ? { theme: options.theme } : {}),
		...(options.onConfirm ? { onConfirm: options.onConfirm } : {}),
	});

	const files: HookFileResult[] = [
		{ name: '.chef/hooks/update-aliases.sh', status: scriptStatus },
	];

	await updateHgrc(rootPath);

	return { files };
}

async function updateHgrc(rootPath: string): Promise<void>
{
	const hgrcPath = path.join(rootPath, '.hg', 'hgrc');

	let content = '';
	try
	{
		content = await fs.readFile(hgrcPath, 'utf8');
	}
	catch
	{
		// File doesn't exist — start fresh
	}

	const relativeScriptPath = '.chef/hooks/update-aliases.sh';
	const hookEntries: Record<string, string> = {
		'update.chef': relativeScriptPath,
		'changegroup.chef': relativeScriptPath,
	};

	const hookNames = Object.keys(hookEntries);

	const lines = content.split('\n');
	const hooksIndex = lines.findIndex((line) => line.trim() === '[hooks]');

	if (hooksIndex === -1)
	{
		if (content.length > 0 && !content.endsWith('\n'))
		{
			content += '\n';
		}

		content += '\n[hooks]\n';
		for (const [key, value] of Object.entries(hookEntries))
		{
			content += `${key} = ${value}\n`;
		}
	}
	else
	{
		const nextSectionIndex = lines.findIndex(
			(line, i) => i > hooksIndex && /^\[.+]$/.test(line.trim()),
		);
		const sectionEnd = nextSectionIndex === -1 ? lines.length : nextSectionIndex;

		// Remove all chef hooks and empty lines from the [hooks] section
		const filteredLines = lines.filter((line, i) => {
			if (i <= hooksIndex || i >= sectionEnd)
			{
				return true;
			}

			const trimmed = line.trim();
			if (trimmed === '')
			{
				return false;
			}

			return !hookNames.some((key) => trimmed.startsWith(key));
		});

		const newHooksIndex = filteredLines.findIndex((line) => line.trim() === '[hooks]');
		const newNextSection = filteredLines.findIndex(
			(line, i) => i > newHooksIndex && /^\[.+]$/.test(line.trim()),
		);
		const insertAt = newNextSection === -1 ? filteredLines.length : newNextSection;

		const hookLines = Object.entries(hookEntries).map(([key, value]) => `${key} = ${value}`);
		filteredLines.splice(insertAt, 0, ...hookLines);

		content = filteredLines.join('\n');
	}

	await fs.writeFile(hgrcPath, content);
}
