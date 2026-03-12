import chalk from 'chalk';

function stringify(value: unknown): string
{
	if (typeof value === 'string')
	{
		return value;
	}

	return JSON.stringify(value, null, 2) ?? String(value);
}

function isScalar(value: unknown): boolean
{
	return typeof value === 'string' || typeof value === 'number'
		|| typeof value === 'boolean' || value === null || value === undefined;
}

export function renderDiff(actual: unknown, expected: unknown): string[]
{
	// For scalar values: simple Expected / Received
	if (isScalar(actual) && isScalar(expected))
	{
		const expectedStr = stringify(expected);
		const actualStr = stringify(actual);

		return [
			...expectedStr.split('\n').map((line, i) =>
				chalk.green(i === 0 ? `  Expected: ${line}` : `            ${line}`),
			),
			...actualStr.split('\n').map((line, i) =>
				chalk.red(i === 0 ? `  Received: ${line}` : `            ${line}`),
			),
		];
	}

	// For objects/arrays: line-by-line diff
	const actualStr = stringify(actual);
	const expectedStr = stringify(expected);
	const actualLines = actualStr.split('\n');
	const expectedLines = expectedStr.split('\n');
	const maxLen = Math.max(actualLines.length, expectedLines.length);
	const lines: string[] = [];

	lines.push(`  ${chalk.green('- Expected')}  ${chalk.red('+ Received')}`);
	lines.push('');

	for (let i = 0; i < maxLen; i++)
	{
		const aLine = actualLines[i];
		const eLine = expectedLines[i];

		if (aLine === eLine)
		{
			lines.push(`      ${aLine}`);
		}
		else
		{
			if (eLine !== undefined)
			{
				lines.push(`    ${chalk.green('-')} ${chalk.green(eLine)}`);
			}
			if (aLine !== undefined)
			{
				lines.push(`    ${chalk.red('+')} ${chalk.red(aLine)}`);
			}
		}
	}

	return lines;
}
