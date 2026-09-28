import { Command, program } from 'commander';

import { commandRegistry, loadCommand } from '../command-registry';
import { renderAgentGuide } from './render-agent-guide';

async function findCommand(commandPath: string[]): Promise<Command | null>
{
	const [name, ...subcommandNames] = commandPath;
	const entry = commandRegistry.find((registryEntry) => registryEntry.name === name);
	if (!entry)
	{
		return null;
	}

	let command = await loadCommand(entry);
	for (const subcommandName of subcommandNames)
	{
		const subcommand = command.commands.find((candidate) => candidate.name() === subcommandName);
		if (!subcommand)
		{
			return null;
		}

		command = subcommand;
	}

	return command;
}

const helpCommand = new Command('help')
	.description('Show help for a command, or "chef help agent" for the AI agent guide')
	.argument('[command...]', 'Command to show help for (e.g. "build", "test unit"), or "agent"')
	.action(async (commandPath: string[]) => {
		if (commandPath.length === 0)
		{
			program.outputHelp();

			return;
		}

		if (commandPath.length === 1 && commandPath[0] === 'agent')
		{
			process.stdout.write(await renderAgentGuide());

			return;
		}

		const command = await findCommand(commandPath);
		if (!command)
		{
			console.error(`error: unknown command '${commandPath.join(' ')}'`);
			process.exitCode = 1;

			return;
		}

		command.outputHelp();
	});

export { helpCommand };
