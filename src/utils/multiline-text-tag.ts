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

	let minIndent = 100;
	for (let i = 0; i < lines.length; i++)
	{
		const line = lines[i];
		const trimmedLine = line.trim();

		if (trimmedLine === '')
		{
			continue;
		}

		const leadingWhitespaceMatch = line.match(/^\t*/);
		const leadingWhitespaceLength = leadingWhitespaceMatch ? leadingWhitespaceMatch[0].length : 0;

		if (leadingWhitespaceLength < minIndent)
		{
			minIndent = leadingWhitespaceLength;
		}
	}

	const indentedLines = lines.map((line) => {
		if (line.startsWith('\t'.repeat(minIndent)))
		{
			return line.substring(minIndent);
		}

		return line;
	});

	return indentedLines.join('\n').trim();
}
