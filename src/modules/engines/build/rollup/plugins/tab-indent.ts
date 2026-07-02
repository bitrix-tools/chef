import MagicString from 'magic-string';
import type { Plugin, OutputAsset } from 'rollup';

export function convertIndent(code: string): string
{
	return code.replace(/^\t*( {2})+/gm, (match) => {
		return match.replace(/ {2}/g, '\t');
	});
}

/**
 * Replaces leading pairs of spaces with tabs, tracking the change in a source map so
 * column positions stay correct. Runs in renderChunk (not generateBundle): there the map
 * is already finalized, so mutating the code would desync it and shift columns.
 */
function convertIndentWithMap(code: string): { code: string; map: ReturnType<MagicString['generateMap']> }
{
	const magic = new MagicString(code);
	const re = /^\t*( {2})+/gm;

	let match: RegExpExecArray | null = re.exec(code);
	while (match !== null)
	{
		const replacement = match[0].replace(/ {2}/g, '\t');
		if (replacement !== match[0])
		{
			magic.overwrite(match.index, match.index + match[0].length, replacement);
		}

		match = re.exec(code);
	}

	return {
		// hires: leading-space→tab shifts columns on every indented line, so a mapping is
		// needed per character to keep devtools precise.
		code: magic.toString(),
		map: magic.generateMap({ hires: true }),
	};
}

export default function tabIndentPlugin(): Plugin
{
	return {
		name: 'tab-indent',
		renderChunk(code)
		{
			return convertIndentWithMap(code);
		},
		generateBundle(_options, bundle)
		{
			// renderChunk doesn't run for emitted assets (e.g. concatenated .js from the
			// concat plugin), so convert their indentation here. Assets carry their own map;
			// this is a plain text pass over asset sources.
			for (const [fileName, chunk] of Object.entries(bundle))
			{
				if (chunk.type === 'asset' && fileName.endsWith('.js') && typeof chunk.source === 'string')
				{
					(chunk as OutputAsset).source = convertIndent(chunk.source);
				}
			}
		},
	};
}
