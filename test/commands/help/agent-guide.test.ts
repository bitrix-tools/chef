import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, it, before } from 'mocha';
import { assert } from 'chai';

import { commandRegistry, loadCommand } from '../../../src/commands/command-registry';
import { getAgentGuideTemplatePath, renderAgentGuide } from '../../../src/commands/help/render-agent-guide';
import { CF } from '../../../src/diagnostics/diagnostic-codes';
import { getChefVersion } from '../../../src/utils/chef-version';

import type { Command } from 'commander';

function collectCommands(command: Command): Command[]
{
	return [command, ...command.commands.flatMap(collectCommands)];
}

function hasOption(command: Command, flag: string): boolean
{
	return command.options.some((option) => option.long === flag || option.short === flag);
}

/**
 * The hand-written part of the guide mentions commands and flags. These tests
 * fail when one of them is renamed or removed, so the guide cannot silently
 * drift from the CLI between releases.
 */
describe('agent guide', () => {
	const template = fs.readFileSync(getAgentGuideTemplatePath(), 'utf-8');
	const codeSpans = [...template.matchAll(/`([^`]+)`/g)].map((match) => match[1]);

	let topLevelCommands: Map<string, Command>;
	let allCommands: Command[];
	let guide: string;

	before(async () => {
		topLevelCommands = new Map();
		for (const entry of commandRegistry)
		{
			topLevelCommands.set(entry.name, await loadCommand(entry));
		}

		allCommands = [...topLevelCommands.values()].flatMap(collectCommands);
		guide = await renderAgentGuide();
	});

	it('should mention only existing commands and their options', () => {
		const invocations = codeSpans.filter((span) => span.startsWith('chef '));
		assert.isNotEmpty(invocations);

		for (const invocation of invocations)
		{
			const [, name, ...rest] = invocation.split(/\s+/);
			let command = topLevelCommands.get(name);
			assert.isDefined(command, `"${invocation}": unknown command "${name}"`);

			let index = 0;
			while (index < rest.length)
			{
				const subcommand = command.commands.find((candidate) => candidate.name() === rest[index]);
				if (!subcommand)
				{
					break;
				}

				command = subcommand;
				index++;
			}

			for (const flag of rest.slice(index).filter((token) => token.startsWith('-')))
			{
				assert.isTrue(hasOption(command, flag), `"${invocation}": "chef ${command.name()}" has no option ${flag}`);
			}
		}
	});

	it('should mention only existing options', () => {
		const flags = codeSpans
			.filter((span) => span.startsWith('-'))
			.map((span) => span.split(/\s+/)[0]);

		assert.isNotEmpty(flags);

		for (const flag of flags)
		{
			assert.isTrue(
				allCommands.some((command) => hasOption(command, flag)),
				`No command has the option ${flag}`,
			);
		}
	});

	it('should mention only existing error codes', () => {
		const knownCodes = new Set<string>(Object.values(CF));

		for (const code of template.match(/CF\d{4}/g) ?? [])
		{
			assert.isTrue(knownCodes.has(code), `Unknown error code ${code}`);
		}
	});

	it('should fill every placeholder', () => {
		assert.notMatch(guide, /\{\{\w+}}/);
		assert.include(guide, `# chef ${getChefVersion()}`);
	});

	it('should list every command and error code', () => {
		for (const entry of commandRegistry)
		{
			assert.include(guide, `- \`chef ${entry.name}`);
		}

		for (const [name, code] of Object.entries(CF))
		{
			assert.include(guide, `- ${code} ${name}`);
		}
	});

	it('should reference only existing documentation files', () => {
		const docsDirectory = guide.match(/paths relative to `([^`]+)`/)?.[1];
		assert.isDefined(docsDirectory);

		const absolutePaths = [...guide.matchAll(/`([^`]+\.md)`/g)]
			.map((match) => match[1])
			.filter((filePath) => path.isAbsolute(filePath));
		const relativePaths = [...guide.matchAll(/^- (\S+\.md) — /gm)].map((match) => `${docsDirectory}/${match[1]}`);

		assert.isNotEmpty(absolutePaths);
		assert.isNotEmpty(relativePaths);

		for (const filePath of [...absolutePaths, ...relativePaths])
		{
			assert.isTrue(fs.existsSync(filePath), `Missing documentation file ${filePath}`);
		}
	});
});
