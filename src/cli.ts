import * as path from 'node:path';

import { Command, program } from 'commander';

import { Environment } from './environment/environment';
import { CF } from './diagnostics/diagnostic-codes';
import { formatError } from './diagnostics/format-error';
import { checkForUpdates } from './utils/update-notifier';
import { getChefVersion } from './utils/chef-version';
import { commandRegistry, loadCommand } from './commands/command-registry';

import type { CommandRegistryEntry } from './commands/command-registry';

function lazyCommand(entry: CommandRegistryEntry): Command
{
	const lazy = new Command(entry.name)
		.description(entry.description)
		.allowUnknownOption(true)
		.allowExcessArguments(true)
		.helpOption(false);

	let executed = false;

	lazy.action(async () => {
		if (executed)
		{
			return;
		}

		executed = true;

		const command = await loadCommand(entry);

		const argv = process.argv.slice(process.argv.indexOf(entry.name) + 1);
		await command.parseAsync(argv, { from: 'user' });
	});

	return lazy;
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

	const relativeCwd = path.relative(root, cwd);
	const isOutsideRoot = envType === 'unknown' || relativeCwd.startsWith('..') || path.isAbsolute(relativeCwd);

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
	.version(getChefVersion())
	.description('CLI toolkit for building, testing and maintaining Bitrix JS extensions')
	.helpCommand(false)
	.addHelpText('after', '\nAI coding agents: run "chef help agent" for a guide that matches this chef version.')
	.hook('preAction', adjustCwdPreAction)
	.hook('preAction', checkCwdPreAction);

for (const entry of commandRegistry)
{
	program.addCommand(lazyCommand(entry));
}

// For outdated browser data browserslist suggests `npx update-browserslist-db`, which updates the
// project, not the copy chef ships. Chef shows its own notice instead (see browser-data-age).
process.env.BROWSERSLIST_IGNORE_OLD_DATA ??= '1';

checkForUpdates();

program.parseAsync(process.argv);
