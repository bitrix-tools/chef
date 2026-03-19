import * as path from 'node:path';

import { Command, program } from 'commander';

import { Environment } from './environment/environment';
import { CF } from './diagnostics/diagnostic-codes';
import { formatError } from './diagnostics/format-error';

async function loadAndRun(loader: () => Promise<Record<string, unknown>>): Promise<void>
{
	const mod = await loader();
	const command = Object.values(mod).find((v) => v instanceof Command) as Command;

	(program.commands as Command[]) = program.commands.filter((c) => c.name() !== command.name());
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

function adjustCwdPreAction(thisCommand: Command, actionCommand: Command)
{
	const sourceCwd = actionCommand.getOptionValue('path');
	if (!sourceCwd)
	{
		return;
	}
	const envType = Environment.getType();
	const root = Environment.getRoot();

	if (envType === 'project' && sourceCwd === root)
	{
		const newCwd = path.join(sourceCwd, 'local');
		actionCommand.setOptionValueWithSource('path', newCwd, sourceCwd);
	}
}

function checkCwdPreAction(thisCommand: Command, actionCommand: Command)
{
	const cwd = actionCommand.getOptionValue('path');
	if (!cwd)
	{
		return;
	}

	const envType = Environment.getType();
	const root = Environment.getRoot();

	const isOutsideRoot = envType === 'unknown' || !cwd.startsWith(root);

	if (isOutsideRoot)
	{
		console.log('');
		console.log(formatError({ code: CF.OUTSIDE_PROJECT_ROOT, severity: 'error', message: `The target directory is outside the project root: ${cwd}` }).join('\n'));
		console.log('');
		process.exit(1);
	}
}

program
	.name('chef')
	.description('CLI toolkit for building, testing and maintaining Bitrix JS extensions')
	.addCommand(lazyCommand('build', 'Build JS extensions for Bitrix', () => import('./commands/build/build-command')))
	.addCommand(lazyCommand('lint', 'Run linting for Bitrix JS extensions', () => import('./commands/lint/lint-command')))
	.addCommand(lazyCommand('stat', 'Show build, tests and bundle statistics for Bitrix extensions', () => import('./commands/stat/stat-command')))
	.addCommand(lazyCommand('test', 'Run unit and end-to-end tests for extensions', () => import('./commands/test/test-command')))
	.addCommand(lazyCommand('create', 'Create a new Bitrix JS extension scaffold', () => import('./commands/create/create-command')))
	.addCommand(lazyCommand('flow-to-ts', 'Migrate Flow-typed JS code to TypeScript in extensions', () => import('./commands/flow-to-ts/flow-to-ts-command')))
	.addCommand(lazyCommand('aliases', 'Regenerate path aliases for TypeScript', () => import('./commands/aliases/aliases-command')))
	.addCommand(lazyCommand('init', 'Initialize testing and build tooling for your Bitrix project', () => import('./commands/init/init-command')))
	.hook('preAction', adjustCwdPreAction)
	.hook('preAction', checkCwdPreAction)
	.parse(process.argv);
