export function multiline(strings: TemplateStringsArray, ...values: any[]): string
{
	let rawText = '';
	for (let i = 0; i < strings.length; i++)
	{
		rawText += strings[i];
		if (i < values.length)
		{
			rawText += values[i];
		}
	}

	const lines = rawText.split('\n');

	let minIndent = Infinity;
	for (const line of lines)
	{
		if (line.trim() === '')
		{
			continue;
		}

		const match = line.match(/^[\t ]*/);
		const indent = match ? match[0].length : 0;

		if (indent < minIndent)
		{
			minIndent = indent;
		}
	}

	if (minIndent === Infinity)
	{
		minIndent = 0;
	}

	const dedented = lines.map((line) => line.substring(minIndent));

	return dedented.join('\n').trim();
}
