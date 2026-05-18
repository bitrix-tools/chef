/**
 * Returns the set of 1-based line numbers suppressed by `@chef-ignore` markers.
 * Suppression mirrors the legacy behaviour:
 *   - inline:        `code; // @chef-ignore` suppresses warnings on this line.
 *   - previous-line: `// @chef-ignore` suppresses warnings on the very next line.
 */
export function collectIgnoredLines(code: string): Set<number>
{
	const ignored = new Set<number>();
	const lines = code.split('\n');

	for (let i = 0; i < lines.length; i++)
	{
		if (!lines[i].includes('@chef-ignore'))
		{
			continue;
		}

		// Inline marker — suppresses the line where it appears.
		ignored.add(i + 1);

		// Previous-line marker — suppresses the line after the comment.
		if (i + 1 < lines.length)
		{
			ignored.add(i + 2);
		}
	}

	return ignored;
}
