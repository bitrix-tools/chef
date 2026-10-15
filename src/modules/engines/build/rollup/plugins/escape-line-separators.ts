import MagicString from 'magic-string';
import type { Plugin } from 'rollup';

// U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR.
const LINE_SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, 'g');

/**
 * Replaces raw U+2028 / U+2029 characters with their escapes. JavaScript counts them as
 * line breaks while source maps count only "\n", so every stack frame below such a
 * character points that many lines too low in the original source. Escaped, they keep
 * the same value in strings and templates and no longer shift line numbers.
 */
export default function escapeLineSeparatorsPlugin(): Plugin
{
	return {
		name: 'escape-line-separators',

		renderChunk(code)
		{
			const separators = [...code.matchAll(LINE_SEPARATORS)];
			if (separators.length === 0)
			{
				return null;
			}

			const magic = new MagicString(code);
			for (const match of separators)
			{
				const escape = `\\u${match[0].charCodeAt(0).toString(16)}`;
				magic.overwrite(match.index, match.index + 1, escape);
			}

			return {
				code: magic.toString(),
				map: magic.generateMap({ hires: true }),
			};
		},
	};
}
