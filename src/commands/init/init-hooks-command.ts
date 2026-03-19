import { Command } from 'commander';
import chalk from 'chalk';
import logSymbols from 'log-symbols';
import boxen from 'boxen';

import { Environment } from '../../environment/environment';
import { SaveFileStatus } from '../../utils/safe-file-write';
import { createPathOption } from '../../shared/options/path-option';
import { multiline } from '../../utils/multiline-text-tag';
import { CF } from '../../diagnostics/diagnostic-codes';
import { formatInternalError } from '../../diagnostics/format-error';
import { detectVcs, installGitHooks, installHgHooks } from './hooks/install-hooks';

import type { InstallHooksResult } from './hooks/install-hooks';

const gitHookDescriptions: Record<string, string> = {
	'.chef/hooks/post-merge': 'Updates aliases after git pull/merge',
	'.chef/hooks/post-checkout': 'Updates aliases after branch checkout',
	'.chef/hooks/post-rewrite': 'Updates aliases after rebase',
};

const hgHookDescriptions: Record<string, string> = {
	'.chef/hooks/update-aliases.sh': 'Updates aliases after hg update/pull',
};

const initHooksCommand = new Command('hooks')
	.description('Install VCS hooks to auto-update path aliases on pull/merge')
	.addOption(createPathOption('Project root where hooks will be installed'))
	.action(async () => {
		const rootPath = Environment.getRoot();
		const vcs = await detectVcs(rootPath);

		if (!vcs)
		{
			const lines: string[] = [];
			lines.push(chalk.red(`${CF.VCS_NOT_FOUND}: No version control system found`));
			lines.push('');
			lines.push(`Directory ${chalk.dim(rootPath)} does not contain`);
			lines.push(`${chalk.bold('.git')} or ${chalk.bold('.hg')} directory.`);
			lines.push('');
			lines.push(`Make sure you are running this command from the project root.`);

			console.log('');
			console.log(boxen(lines.join('\n'), {
				padding: 1,
				borderStyle: 'round',
				borderColor: 'red',
			}));

			process.exitCode = 1;

			return;
		}

		const descriptions = vcs === 'git' ? gitHookDescriptions : hgHookDescriptions;
		const fileList = Object.entries(descriptions)
			.map(([name, desc]) => `  \u2022 ${chalk.cyan(name)} \u2014 ${desc}`)
			.join('\n');

		console.log(
			multiline`
				Preparing ${vcs} hooks in ${Environment.getRoot()}

				${chalk.bold('The following files will be added/updated:')}
				${fileList}
			`,
		);

		if (vcs === 'git')
		{
			console.log(`  \u2022 ${chalk.cyan('git core.hooksPath')} \u2014 Will be set to ${chalk.cyan('.chef/hooks')}`);
		}
		else
		{
			console.log(`  \u2022 ${chalk.cyan('.hg/hgrc [hooks]')} \u2014 Will add update.chef and changegroup.chef entries`);
		}

		console.log('');

		try
		{
			const theme = {
				prefix: `  ${chalk.green(logSymbols.success)}`,
			};

			const result: InstallHooksResult = vcs === 'git'
				? await installGitHooks(rootPath, { theme })
				: await installHgHooks(rootPath, { theme });

			if (vcs === 'git')
			{
				console.log(`  ${chalk.green(logSymbols.success)} git core.hooksPath set to ${chalk.cyan('.chef/hooks')}`);
			}
			else
			{
				console.log(`  ${chalk.green(logSymbols.success)} .hg/hgrc updated with hook entries`);
			}

			const statusMap: Record<string, string> = {
				[SaveFileStatus.CREATED]: 'Files created:',
				[SaveFileStatus.REPLACED]: 'Files replaced:',
			};

			const handledStatuses = [SaveFileStatus.CREATED, SaveFileStatus.REPLACED];
			const filesChangedText = handledStatuses.reduce((acc, status) => {
				const files = result.files.filter((f) => f.status === status);

				if (files.length > 0)
				{
					acc += chalk.bold(`${statusMap[status]}\n`);
					for (const { name } of files)
					{
						const desc = descriptions[name] ?? '';
						acc += `  \u2022 ${chalk.yellow(name)}${desc ? ` \u2014 ${desc}` : ''}\n`;
					}
				}

				return acc;
			}, '');

			const messageLines: string[] = [];

			if (filesChangedText.length > 0)
			{
				messageLines.push(filesChangedText.trimEnd());
				messageLines.push('');
			}

			messageLines.push(
				`${chalk.bold('What these hooks do:')}`,
				`  Automatically run ${chalk.cyan('chef aliases --quiet')} after pull/merge`,
				`  to keep ${chalk.cyan('aliases.tsconfig.json')} up to date.`,
				'',
				`${chalk.bold('Manual regeneration:')} ${chalk.green('chef aliases')}`,
			);

			const hasCancelled = result.files.some((f) => f.status === SaveFileStatus.CANCELLED);
			const title = hasCancelled
				? chalk.bold.yellow('\u26A0 Hooks Partially Configured')
				: chalk.bold.green('\u2713 Hooks Configured Successfully!');

			console.log('');
			console.log(
				boxen(messageLines.join('\n'), {
					padding: 1,
					borderStyle: 'round',
					borderColor: hasCancelled ? 'yellow' : 'green',
					title,
				}),
			);
		}
		catch (error)
		{
			const err = error instanceof Error ? error : new Error(String(error));
			console.log('');
			console.log(formatInternalError({
				code: CF.HOOK_INSTALL_FAILED,
				message: err.message,
				stack: err.stack,
			}));

			process.exitCode = 1;
		}
	});

export { initHooksCommand };
