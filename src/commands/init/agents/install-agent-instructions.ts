import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { fileExistsAsync } from '../../../utils/file-exists-async';

const blockStart = '<!-- chef:agent-instructions:start -->';
const blockEnd = '<!-- chef:agent-instructions:end -->';

/**
 * The block only points agents to `chef help agent`, so it never goes stale:
 * the guide itself is printed by the installed chef and matches its version.
 */
const instructionsBlock = [
	blockStart,
	'## chef',
	'',
	'JS extensions in this project are built, type-checked, linted and tested with chef (`@bitrix/chef`).',
	'Run `chef help agent` to see what the installed chef version can do and how it behaves.',
	blockEnd,
].join('\n');

export type AgentInstructionsStatus = 'created' | 'updated' | 'unchanged' | 'imports-agents-md';

export type AgentInstructionsFile = {
	name: string,
	status: AgentInstructionsStatus,
};

export type InstallAgentInstructionsResult = {
	files: AgentInstructionsFile[],
	/** CLAUDE.local.md without a shared CLAUDE.md — Claude Code reads it instead of AGENTS.md. */
	hasLocalClaudeFileOnly: boolean,
};

export function upsertInstructionsBlock(content: string): string
{
	const startIndex = content.indexOf(blockStart);
	const endIndex = content.indexOf(blockEnd);

	if (startIndex !== -1 && endIndex > startIndex)
	{
		return content.slice(0, startIndex) + instructionsBlock + content.slice(endIndex + blockEnd.length);
	}

	if (content.trim() === '')
	{
		return `${instructionsBlock}\n`;
	}

	return `${content.trimEnd()}\n\n${instructionsBlock}\n`;
}

async function writeInstructions(rootPath: string, name: string): Promise<AgentInstructionsFile>
{
	const filePath = path.join(rootPath, name);
	const isExists = await fileExistsAsync(filePath);
	const content = isExists ? await fs.readFile(filePath, 'utf-8') : '';
	const nextContent = upsertInstructionsBlock(content);

	if (nextContent === content)
	{
		return { name, status: 'unchanged' };
	}

	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, nextContent);

	return { name, status: isExists ? 'updated' : 'created' };
}

function importsAgentsFile(content: string): boolean
{
	return /^\s*@(\.\/)?AGENTS\.md\s*$/m.test(content);
}

/**
 * Writes the chef block into AGENTS.md, which most coding agents read. Claude
 * Code skips AGENTS.md when the project has its own CLAUDE.md, so existing
 * CLAUDE.md files get the block too — unless they already import AGENTS.md.
 */
export async function installAgentInstructions(rootPath: string): Promise<InstallAgentInstructionsResult>
{
	const files: AgentInstructionsFile[] = [await writeInstructions(rootPath, 'AGENTS.md')];
	let hasSharedClaudeFile = false;

	for (const name of ['CLAUDE.md', '.claude/CLAUDE.md'])
	{
		const filePath = path.join(rootPath, name);
		if (!await fileExistsAsync(filePath))
		{
			continue;
		}

		hasSharedClaudeFile = true;

		if (importsAgentsFile(await fs.readFile(filePath, 'utf-8')))
		{
			files.push({ name, status: 'imports-agents-md' });
		}
		else
		{
			files.push(await writeInstructions(rootPath, name));
		}
	}

	return {
		files,
		hasLocalClaudeFileOnly: !hasSharedClaudeFile && await fileExistsAsync(path.join(rootPath, 'CLAUDE.local.md')),
	};
}
