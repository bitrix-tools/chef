import { Command } from 'commander';
import chalk from 'chalk';
import logSymbols from 'log-symbols';

import { Environment } from '../../environment/environment';
import { createPathOption } from '../../shared/options/path-option';
import { formatError } from '../../diagnostics/format-error';
import { CF } from '../../diagnostics/diagnostic-codes';
import { installAgentInstructions } from './agents/install-agent-instructions';

import type { AgentInstructionsStatus } from './agents/install-agent-instructions';

const statusLabels: Record<AgentInstructionsStatus, string> = {
	created: 'created',
	updated: 'updated',
	unchanged: 'already up to date',
	'imports-agents-md': 'imports AGENTS.md, left as is',
};

const initAgentsCommand = new Command('agents')
	.description('Point AI coding agents to "chef help agent" from AGENTS.md (and CLAUDE.md)')
	.addOption(createPathOption('Project root where agent instructions will be written'))
	.action(async (options: { path: string }) => {
		Environment.setContext(options.path);

		const rootPath = Environment.getRoot();
		if (Environment.getType() === 'unknown' || !rootPath)
		{
			console.log(formatError({
				code: CF.PROJECT_ROOT_NOT_FOUND,
				severity: 'error',
				message: `Could not detect a Bitrix project root from ${options.path}`,
			}).join('\n'));
			process.exitCode = 1;

			return;
		}

		const result = await installAgentInstructions(rootPath);

		console.log(`Agent instructions in ${rootPath}`);
		console.log('');

		for (const file of result.files)
		{
			const symbol = file.status === 'created' || file.status === 'updated'
				? chalk.green(logSymbols.success)
				: chalk.dim('•');

			console.log(`  ${symbol} ${chalk.cyan(file.name)} — ${statusLabels[file.status]}`);
		}

		if (result.hasLocalClaudeFileOnly)
		{
			console.log('');
			console.log(`  ${chalk.yellow(logSymbols.warning)} Claude Code reads ${chalk.cyan('CLAUDE.local.md')} instead of ${chalk.cyan('AGENTS.md')}.`);
			console.log(`    Add a line ${chalk.cyan('@AGENTS.md')} to ${chalk.cyan('CLAUDE.local.md')} so Claude Code sees these instructions.`);
		}

		console.log('');
		console.log(`Agents are told to run ${chalk.green('chef help agent')}. The guide comes from the installed chef,`);
		console.log('so it stays current after chef updates — no need to rerun this command.');
	});

export { initAgentsCommand };
