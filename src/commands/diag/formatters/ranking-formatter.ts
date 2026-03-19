import chalk from 'chalk';
import table from 'text-table';

export type RankingColumn = {
	label: string;
	value: (item: any, index: number) => string;
	align?: 'left' | 'right';
};

type RankingOptions = {
	items: any[];
	columns: RankingColumn[];
	scanned: number;
	duration: number;
};

export function formatRanking({ items, columns, scanned, duration }: RankingOptions): string
{
	if (items.length === 0)
	{
		return [
			`  No results found`,
			'',
			formatFooter(scanned, duration),
			'',
		].join('\n');
	}

	const headerRow = ['', chalk.dim('#'), ...columns.map((col) => chalk.dim(col.label))];
	const align = ['l', 'r', ...columns.map((col) => col.align === 'right' ? 'r' : 'l')] as Array<'l' | 'r'>;

	const dataRows: string[][] = [];

	for (let i = 0; i < items.length; i++)
	{
		const item = items[i];
		const cells = columns.map((col) => col.value(item, i));

		// First line: rank + first line of each cell
		const firstLines = cells.map((cell) => cell.split('\n')[0]);
		dataRows.push(['', chalk.dim(String(i + 1)), ...firstLines]);

		// Continuation lines from multiline cells
		const maxLines = Math.max(...cells.map((cell) => cell.split('\n').length));

		for (let line = 1; line < maxLines; line++)
		{
			const continuationRow = columns.map((_, colIndex) => {
				const lines = cells[colIndex].split('\n');
				return lines[line] ?? '';
			});

			dataRows.push(['', '', ...continuationRow]);
		}
	}

	const output = table([headerRow, ...dataRows], {
		align,
		stringLength: (str) => stripAnsi(str).length,
	});

	return [
		output,
		'',
		formatFooter(scanned, duration),
		'',
	].join('\n');
}

function formatFooter(scanned: number, duration: number): string
{
	const durationStr = (duration / 1000).toFixed(2);
	return ` ${chalk.dim(`Scanned ${scanned} extensions in ${durationStr}s`)}`;
}

function stripAnsi(str: string): string
{
	return str.replace(/\x1B\[[0-9;]*m/g, '');
}
