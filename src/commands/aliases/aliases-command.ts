import { pathToFileURL } from 'node:url';

import { Command } from 'commander';
import chalk from 'chalk';
import logSymbols from 'log-symbols';

import { Environment } from '../../environment/environment';
import { AliasGenerator } from '../../modules/services/alias-generator';
import { createPathOption } from '../../shared/options/path-option';
import { formatInternalError } from '../../diagnostics/format-error';
import { CF } from '../../diagnostics/diagnostic-codes';

const aliasesCommand = new Command('aliases')
	.description('Regenerate path aliases for TypeScript (aliases.tsconfig.json)')
	.option('-q, --quiet', 'Quiet mode for hooks — single-line output without colors')
	.option('--added <paths...>', 'Extension directories to add (incremental update)')
	.option('--removed <paths...>', 'Extension directories to remove (incremental update)')
	.addOption(createPathOption('Project root to scan for extensions'))
	.action(async (options: { quiet?: boolean; added?: string[]; removed?: string[] }) => {
		const rootPath = Environment.getRoot();
		const aliasGenerator = new AliasGenerator();
		const quiet = options.quiet ?? false;
		const isIncremental = options.added || options.removed;

		if (isIncremental)
		{
			await runIncremental({ aliasGenerator, rootPath, quiet, added: options.added ?? [], removed: options.removed ?? [] });
		}
		else
		{
			await runFull({ aliasGenerator, rootPath, quiet });
		}
	});

async function runFull(options: { aliasGenerator: AliasGenerator; rootPath: string; quiet: boolean }): Promise<void>
{
	const { aliasGenerator, rootPath, quiet } = options;
	const isTTY = process.stdout.isTTY ?? false;

	if (!quiet)
	{
		console.log(chalk.bold('Generating path aliases'));
		if (isTTY)
		{
			process.stdout.write(`  Scanning extensions...`);
		}
	}

	try
	{
		const { aliasesCount, filePath } = await aliasGenerator.generate({
			rootPath,
			onProgress: (count) => {
				if (!quiet && isTTY)
				{
					process.stdout.write(`\r\x1B[2K  Scanning extensions... found ${count}`);
				}
			},
		});

		if (quiet)
		{
			console.log(`aliases.tsconfig.json: ${aliasesCount} aliases`);
		}
		else
		{
			if (isTTY)
			{
				process.stdout.write('\r\x1B[2K');
			}
			console.log(`  ${chalk.green(logSymbols.success)} aliases.tsconfig.json generated with ${aliasesCount} aliases`);
			console.log(`  ${chalk.dim('→')} ${pathToFileURL(filePath).href}`);
		}
	}
	catch (error)
	{
		if (!quiet && isTTY)
		{
			process.stdout.write('\r\x1B[2K');
		}

		const err = error instanceof Error ? error : new Error(String(error));

		if (quiet)
		{
			console.error(`aliases.tsconfig.json: error — ${err.message}`);
		}
		else
		{
			console.log(`  ${chalk.red(logSymbols.error)} Error while scanning packages`);
			console.log(formatInternalError({ code: CF.ALIAS_GENERATION_ERROR, message: err.message, stack: err.stack }));
		}

		process.exitCode = 1;
	}
}

async function runIncremental(options: { aliasGenerator: AliasGenerator; rootPath: string; quiet: boolean; added: string[]; removed: string[] }): Promise<void>
{
	const { aliasGenerator, rootPath, quiet, added, removed } = options;

	try
	{
		const result = await aliasGenerator.update({ rootPath, added, removed });

		if (quiet)
		{
			const parts: string[] = [];
			if (result.added.length > 0)
			{
				parts.push(`+${result.added.length}`);
			}
			if (result.removed.length > 0)
			{
				parts.push(`-${result.removed.length}`);
			}

			if (parts.length > 0)
			{
				console.log(`aliases.tsconfig.json: ${parts.join(' ')}`);
			}
		}
		else
		{
			if (result.added.length > 0)
			{
				console.log(chalk.bold('Added aliases:'));
				for (const name of result.added)
				{
					console.log(`  ${chalk.green(logSymbols.success)} ${name}`);
				}
			}
			if (result.removed.length > 0)
			{
				console.log(chalk.bold('Removed aliases:'));
				for (const name of result.removed)
				{
					console.log(`  ${chalk.red(logSymbols.success)} ${name}`);
				}
			}
			if (result.added.length === 0 && result.removed.length === 0)
			{
				console.log('  No alias changes');
			}
		}
	}
	catch (error)
	{
		const err = error instanceof Error ? error : new Error(String(error));

		if (quiet)
		{
			console.error(`aliases.tsconfig.json: error — ${err.message}`);
		}
		else
		{
			console.log(`  ${chalk.red(logSymbols.error)} Error while updating aliases`);
			console.log(formatInternalError({ code: CF.ALIAS_GENERATION_ERROR, message: err.message, stack: err.stack }));
		}

		process.exitCode = 1;
	}
}

export { aliasesCommand };
