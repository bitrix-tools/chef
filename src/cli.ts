import { Command, program } from 'commander';

import { checkCwdPreAction } from './hooks/check-cwd-pre-action';
import { adjustCwdPreAction } from './hooks/adjust-cwd-pre-action';

async function loadAndRun(loader: () => Promise<Record<string, unknown>>): Promise<void>
{
	const mod = await loader();
	const command = Object.values(mod).find((v) => v instanceof Command) as Command;

	program.commands = program.commands.filter((c) => c.name() !== command.name());
	program.addCommand(command);

	await program.parseAsync(process.argv);
}

function lazyCommand(name: string, description: string, loader: () => Promise<Record<string, unknown>>): Command
{
	return new Command(name)
		.description(description)
		.allowUnknownOption(true)
		.allowExcessArguments(true)
		.helpOption(false)
		.action(() => loadAndRun(loader));
}

program
	.name('chef')
	.description('CLI toolkit for building, testing and maintaining Bitrix JS extensions')
	.addCommand(lazyCommand('build', 'Build JS extensions for Bitrix', () => import('./commands/build/build-command')))
	.addCommand(lazyCommand('stat', 'Show build, tests and bundle statistics for Bitrix extensions', () => import('./commands/stat/stat-command')))
	.addCommand(lazyCommand('test', 'Run unit and end-to-end tests for extensions', () => import('./commands/test/test-command')))
	.addCommand(lazyCommand('create', 'Create a new Bitrix JS extension scaffold', () => import('./commands/create/create-command')))
	.addCommand(lazyCommand('flow-to-ts', 'Migrate Flow-typed JS code to TypeScript in extensions', () => import('./commands/flow-to-ts/flow-to-ts.command')))
	.addCommand(lazyCommand('init', 'Initialize testing and build tooling for your Bitrix project', () => import('./commands/init/init-command')))
	.hook('preAction', adjustCwdPreAction)
	.hook('preAction', checkCwdPreAction)
	.parse(process.argv);
