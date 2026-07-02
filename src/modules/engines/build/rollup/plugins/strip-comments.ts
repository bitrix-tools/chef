import MagicString from 'magic-string';
import type { Plugin } from 'rollup';

export default function stripCommentsPlugin(options: { banner?: string } = {}): Plugin
{
	return {
		name: 'strip-comments',
		renderChunk(code)
		{
			const { banner } = options;

			// Keep the banner (a leading block comment Rollup prepends) — strip everything
			// after it. Passing the banner length as `protectedPrefixLength` leaves those
			// characters in place and keeps the map aligned (no line shifting from splicing
			// the banner out and back in).
			const protectedPrefixLength = banner && code.startsWith(banner) ? banner.length : 0;

			return stripCommentsWithMap(code, protectedPrefixLength);
		},
	};
}

/**
 * Removes comments from `code` and returns both the stripped code and a source map that
 * accounts for the removed ranges. `prefix` (e.g. the eslint-disable banner) is prepended
 * to the output through magic-string so the map stays aligned.
 *
 * Uses magic-string so every removal is tracked precisely instead of rebuilding the string
 * (which would desynchronise the source map and shift lines in the browser).
 */
export function stripCommentsWithMap(
	code: string,
	protectedPrefixLength = 0,
): { code: string; map: ReturnType<MagicString['generateMap']> }
{
	const magic = new MagicString(code);

	for (const range of findRemovableRanges(code))
	{
		// Skip anything inside the protected prefix (e.g. the leading banner comment).
		if (range.start < protectedPrefixLength)
		{
			continue;
		}

		magic.remove(range.start, range.end);
	}

	return {
		code: magic.toString(),
		map: magic.generateMap({ hires: true, includeContent: false }),
	};
}

/**
 * Text-only comment stripper kept for callers that just need the string (diagnostics,
 * tests). Delegates to the magic-string implementation and drops the map.
 */
export function stripComments(code: string): string
{
	return stripCommentsWithMap(code).code;
}

type Range = { start: number; end: number };

/**
 * Scans `code` and collects the character ranges to remove: comments (line and block),
 * skipping string/template/regex literals so comment-like content inside them is preserved,
 * plus runs of excessive blank lines. A comment occupying its own line takes the whole line
 * (including its newline) so no blank line is left behind.
 */
// eslint-disable-next-line complexity
function findRemovableRanges(code: string): Range[]
{
	const ranges: Range[] = [];
	let i = 0;

	while (i < code.length)
	{
		const char = code[i];

		if (char === '"' || char === '\'' || char === '`')
		{
			i = skipStringLiteral(code, i);
			continue;
		}

		// Single-line comment.
		if (char === '/' && code[i + 1] === '/')
		{
			const ownLine = isCommentOnOwnLine(code, i);
			// Own-line comment removes the whole line; an inline one removes the comment
			// plus the whitespace before it so no trailing space is left on the code line.
			const start = ownLine ? lineStartIndex(code, i) : trimTrailingWhitespaceStart(code, i);

			let end = i;
			while (end < code.length && code[end] !== '\n')
			{
				end++;
			}
			if (ownLine && end < code.length && code[end] === '\n')
			{
				end++;
			}

			ranges.push({ start, end });
			i = end;
			continue;
		}

		// Multi-line comment.
		if (char === '/' && code[i + 1] === '*')
		{
			const ownLine = isCommentOnOwnLine(code, i);
			const start = ownLine ? lineStartIndex(code, i) : i;

			const commentEnd = code.indexOf('*/', i + 2);
			let end = commentEnd === -1 ? code.length : commentEnd + 2;

			if (ownLine)
			{
				while (end < code.length && (code[end] === ' ' || code[end] === '\t'))
				{
					end++;
				}
				if (end < code.length && code[end] === '\n')
				{
					end++;
				}
			}

			ranges.push({ start, end });
			i = end;
			continue;
		}

		// Regex literal — skip so its slashes aren't mistaken for comments.
		if (char === '/' && isRegexStart(code, i))
		{
			i = skipRegexLiteral(code, i);
			continue;
		}

		// Collapse 3+ consecutive newlines to 2 (one blank line).
		if (char === '\n' && code[i + 1] === '\n' && code[i + 2] === '\n')
		{
			let end = i + 2;
			while (end < code.length && code[end] === '\n')
			{
				end++;
			}
			// Keep two newlines, remove the rest.
			ranges.push({ start: i + 2, end });
			i = end;
			continue;
		}

		i++;
	}

	return ranges;
}

function skipStringLiteral(code: string, start: number): number
{
	const quote = code[start];
	let i = start + 1;

	while (i < code.length && code[i] !== quote)
	{
		if (code[i] === '\\')
		{
			i += 2;
			continue;
		}

		if (quote === '`' && code[i] === '$' && code[i + 1] === '{')
		{
			i = skipTemplateExpression(code, i);
			continue;
		}

		i++;
	}

	return i < code.length ? i + 1 : i;
}

function skipTemplateExpression(code: string, start: number): number
{
	let i = start + 2; // past `${`
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

		i++;
	}

	return i;
}

function skipRegexLiteral(code: string, start: number): number
{
	let i = start + 1;

	while (i < code.length && code[i] !== '/')
	{
		if (code[i] === '\\')
		{
			i += 2;
			continue;
		}

		if (code[i] === '[')
		{
			i++;
			while (i < code.length && code[i] !== ']')
			{
				i += code[i] === '\\' ? 2 : 1;
			}
			if (i < code.length)
			{
				i++;
			}
			continue;
		}

		i++;
	}

	if (i < code.length)
	{
		i++; // closing '/'
	}

	while (i < code.length && /[gimsuy]/.test(code[i]))
	{
		i++;
	}

	return i;
}

/**
 * Whether the character at `position` is preceded only by whitespace on its line.
 */
function isCommentOnOwnLine(code: string, position: number): boolean
{
	let j = position - 1;
	while (j >= 0 && (code[j] === ' ' || code[j] === '\t'))
	{
		j--;
	}

	return j < 0 || code[j] === '\n';
}

/**
 * Index at which to start removal so the whitespace immediately before `position` (on the
 * same line) is also removed — used for inline line comments so no trailing space remains.
 */
function trimTrailingWhitespaceStart(code: string, position: number): number
{
	let j = position;
	while (j > 0 && (code[j - 1] === ' ' || code[j - 1] === '\t'))
	{
		j--;
	}

	return j;
}

/**
 * Index of the first character of the line containing `position`, so removing a whole-line
 * comment also removes its leading indentation.
 */
function lineStartIndex(code: string, position: number): number
{
	let j = position - 1;
	while (j >= 0 && code[j] !== '\n')
	{
		j--;
	}

	return j + 1;
}

/**
 * Whether `/` at `position` starts a regex (rather than a division), judged by the last
 * significant character before it.
 */
function isRegexStart(code: string, position: number): boolean
{
	let j = position - 1;
	while (j >= 0 && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n'))
	{
		j--;
	}

	if (j < 0)
	{
		return true;
	}

	return '=({[;,!&|?:~^%*/+-><'.includes(code[j]);
}
