import chalk from 'chalk';

type FormatSizeOptions = {
	size: number;
	decimals?: number;
	prefix?: string;
};

const k = 1024;
const sizes = ['B', 'KB', 'MB', 'GB'];

export function formatSize(options: FormatSizeOptions): string
{
	const { size, decimals = 2, prefix = '' } = options;

	if (size === 0)
	{
		return '0 B';
	}

	const i = Math.floor(Math.log(size) / Math.log(k));
	const formatted = (size / Math.pow(k, i)).toFixed(decimals);

	return `${prefix}${formatted} ${sizes[i]}`;
}

export function formatSizeDelta(current: number, previous: number | null): string
{
	if (previous === null || previous === 0)
	{
		return chalk.blue('new');
	}

	const delta = current - previous;

	if (delta === 0)
	{
		return chalk.dim('=');
	}

	const deltaStr = formatSize({ size: Math.abs(delta), decimals: 1 });

	if (delta > 0)
	{
		return chalk.red(`+${deltaStr}`);
	}

	return chalk.green(`-${deltaStr}`);
}

export function formatSizeWithDelta(current: number, previous: number | null): string
{
	const sizeStr = formatSize({ size: current, decimals: 1 });
	const deltaStr = formatSizeDelta(current, previous);

	return `${chalk.bold(sizeStr)} ${chalk.dim('(')}${deltaStr}${chalk.dim(')')}`;
}
