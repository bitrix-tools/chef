import type { Plugin } from 'rollup';

export default function stripCommentsPlugin(options: { banner?: string } = {}): Plugin
{
	return {
		name: 'strip-comments',
		renderChunk(code)
		{
			const { banner } = options;
			let input = code;

			if (banner && code.startsWith(banner))
			{
				input = code.slice(banner.length);
			}

			const stripped = stripComments(input);

			return {
				code: banner ? `${banner}\n${stripped.trimStart()}` : stripped,
				map: null,
			};
		},
	};
}

function stripComments(code: string): string
{
	let result = '';
	let i = 0;

	while (i < code.length)
	{
		// String literals
		if (code[i] === '"' || code[i] === '\'' || code[i] === '`')
		{
			const quote = code[i];
			result += quote;
			i++;

			while (i < code.length && code[i] !== quote)
			{
				if (code[i] === '\\')
				{
					result += code[i] + code[i + 1];
					i += 2;
				}
				else
				{
					if (quote === '`' && code[i] === '$' && code[i + 1] === '{')
					{
						// Template literal expression — copy until matching }
						const expr = copyTemplateExpression(code, i);
						result += expr.text;
						i = expr.end;
					}
					else
					{
						result += code[i];
						i++;
					}
				}
			}

			if (i < code.length)
			{
				result += code[i];
				i++;
			}

			continue;
		}

		// Single-line comment
		if (code[i] === '/' && code[i + 1] === '/')
		{
			while (i < code.length && code[i] !== '\n')
			{
				i++;
			}

			continue;
		}

		// Multi-line comment
		if (code[i] === '/' && code[i + 1] === '*')
		{
			const commentEnd = code.indexOf('*/', i + 2);
			if (commentEnd === -1)
			{
				i = code.length;
			}
			else
			{
				i = commentEnd + 2;
			}

			continue;
		}

		// Regular expression literals
		if (code[i] === '/' && isRegexStart(code, i, result))
		{
			result += code[i];
			i++;

			while (i < code.length && code[i] !== '/')
			{
				if (code[i] === '\\')
				{
					result += code[i] + code[i + 1];
					i += 2;
				}
				else if (code[i] === '[')
				{
					while (i < code.length && code[i] !== ']')
					{
						if (code[i] === '\\')
						{
							result += code[i] + code[i + 1];
							i += 2;
						}
						else
						{
							result += code[i];
							i++;
						}
					}

					if (i < code.length)
					{
						result += code[i];
						i++;
					}
				}
				else
				{
					result += code[i];
					i++;
				}
			}

			if (i < code.length)
			{
				result += code[i];
				i++;
			}

			while (i < code.length && /[gimsuy]/.test(code[i]))
			{
				result += code[i];
				i++;
			}

			continue;
		}

		result += code[i];
		i++;
	}

	// Clean up blank lines left by removed comments
	return result.replace(/\n{3,}/g, '\n\n');
}

function isRegexStart(code: string, position: number, preceding: string): boolean
{
	const trimmed = preceding.trimEnd();
	if (trimmed.length === 0)
	{
		return true;
	}

	const lastChar = trimmed[trimmed.length - 1];

	// After these characters, / starts a regex
	return '=({[;,!&|?:~^%*/+-><'.includes(lastChar);
}

function copyTemplateExpression(code: string, start: number): { text: string; end: number }
{
	let text = code[start] + code[start + 1]; // ${
	let i = start + 2;
	let depth = 1;

	while (i < code.length && depth > 0)
	{
		if (code[i] === '{')
		{
			depth++;
		}
		else if (code[i] === '}')
		{
			depth--;
		}

		text += code[i];
		i++;
	}

	return { text, end: i };
}
