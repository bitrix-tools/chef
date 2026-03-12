import { createRequire } from 'node:module';
import boxen from 'boxen';

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

export function renderFatalError(error)
{
	const message = error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : undefined;
	const code = (error instanceof Error && typeof error.code === 'string' && error.code.startsWith('CF'))
		? error.code
		: 'CF9002';

	try
	{
		const require = createRequire(import.meta.url);
		const { formatInternalError } = require('../src/diagnostics/format-error.ts');

		console.log('');
		console.log(formatInternalError({ code, message, stack }));
	}
	catch
	{
		// Intentional duplication of formatInternalError logic.
		// This fallback must work even when the main codebase fails to load.
		const lines = [];

		lines.push(red(bold(`${code}: ${message}`)));

		if (stack)
		{
			lines.push('');
			lines.push(dim('Stack trace:'));
			const stackLines = stack.split('\n')
				.filter((line) => line.trim().length > 0)
				.slice(1);
			for (const line of stackLines)
			{
				lines.push(dim(line.trim()));
			}
		}

		lines.push('');
		lines.push(`${dim('chef')}     ${getVersion()}`);
		lines.push(`${dim('node')}     ${process.version}`);
		lines.push(`${dim('platform')} ${process.platform} ${process.arch}`);
		lines.push('');
		lines.push('If this is unexpected, please report it:');
		lines.push(cyan('https://github.com/bitrix-tools/chef/issues'));

		console.log('');
		console.log(boxen(lines.join('\n'), {
			padding: 1,
			borderStyle: 'round',
			borderColor: 'red',
			title: red(bold('Internal Error')),
		}));
	}

	process.exit(1);
}

function getVersion()
{
	try
	{
		const require = createRequire(import.meta.url);
		return require('../package.json').version ?? 'unknown';
	}
	catch
	{
		return 'unknown';
	}
}
