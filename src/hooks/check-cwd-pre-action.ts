import { Command } from 'commander';
import { Environment } from '../environment/environment';

export function checkCwdPreAction(thisCommand: Command, actionCommand: Command)
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
		console.log(`\n❌ Error: \nThe target directory is outside the project root: ${cwd}\n`);
		process.exit(1);
	}
}
