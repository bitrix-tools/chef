import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { commandRegistry, loadCommand } from '../command-registry';
import { CF } from '../../diagnostics/diagnostic-codes';
import { getChefRoot } from '../../utils/chef-root';
import { getChefVersion } from '../../utils/chef-version';
import { renderTemplate } from '../../utils/render-template';

import type { Argument, Command, Option } from 'commander';

export function getAgentGuideTemplatePath(): string
{
	return path.join(import.meta.dirname, 'agent-guide.md');
}

function formatArgument(argument: Argument): string
{
	const name = argument.variadic ? `${argument.name()}...` : argument.name();

	return argument.required ? `<${name}>` : `[${name}]`;
}

function formatOption(option: Option): string
{
	const flag = option.long ?? option.short;
	const valuePlaceholder = option.flags.match(/[<[]([^>\]]+)[>\]]$/)?.[1];
	if (!valuePlaceholder)
	{
		return flag;
	}

	const value = option.argChoices ? option.argChoices.join('|') : valuePlaceholder;

	return option.required ? `${flag} <${value}>` : `${flag} [${value}]`;
}

function appendCommand(lines: string[], command: Command, parentName: string, parentOptions: string): void
{
	const name = `${parentName} ${command.name()}`;
	const signature = [name, ...command.registeredArguments.map(formatArgument)].join(' ');
	const options = command.options
		.filter((option) => !option.hidden)
		.map((option) => `\`${formatOption(option)}\``)
		.join(' ');

	lines.push(`- \`${signature}\` — ${command.description()}`);

	if (options !== '' && options !== parentOptions)
	{
		lines.push(`  ${options}`);
	}

	for (const subcommand of command.commands)
	{
		appendCommand(lines, subcommand, name, options);
	}
}

async function renderCommands(): Promise<string>
{
	const lines: string[] = [];

	for (const entry of commandRegistry)
	{
		appendCommand(lines, await loadCommand(entry), 'chef', '');
	}

	return lines.join('\n');
}

function renderErrorCodes(): string
{
	return Object.entries(CF)
		.map(([name, code]) => `- ${code} ${name}`)
		.join('\n');
}

function extractTitle(markdown: string): string | null
{
	for (const line of markdown.split('\n'))
	{
		if (line.startsWith('```'))
		{
			return null;
		}

		if (line.startsWith('# '))
		{
			return line.slice(2).trim();
		}
	}

	return null;
}

async function renderDocuments(docsDirectory: string): Promise<string>
{
	let fileNames: string[];

	try
	{
		fileNames = await fs.readdir(docsDirectory, { recursive: true });
	}
	catch
	{
		return 'The documentation is not bundled with this chef installation.';
	}

	const lines: string[] = [];

	for (const fileName of fileNames.filter((name) => name.endsWith('.md')).sort())
	{
		const title = extractTitle(await fs.readFile(path.join(docsDirectory, fileName), 'utf-8'));
		if (title)
		{
			lines.push(`- ${fileName.split(path.sep).join('/')} — ${title}`);
		}
	}

	return lines.join('\n');
}

/**
 * Renders the guide for AI coding agents. The rules come from a hand-written
 * template; commands, options, error codes and the documentation index are
 * generated from the running chef, so they always match its version.
 */
export async function renderAgentGuide(): Promise<string>
{
	const docsDirectory = path.join(getChefRoot() ?? '', 'docs', 'en');
	const template = await fs.readFile(getAgentGuideTemplatePath(), 'utf-8');

	return renderTemplate({
		template,
		replacements: {
			version: getChefVersion(),
			docsDirectory,
			commands: await renderCommands(),
			errorCodes: renderErrorCodes(),
			documents: await renderDocuments(docsDirectory),
		},
	});
}
