import type { Plugin, OutputChunk, OutputAsset } from 'rollup';

export function convertIndent(code: string): string
{
	return code.replace(/^[\t]*( {2})+/gm, (match) => {
		return match.replace(/ {2}/g, '\t');
	});
}

export default function tabIndentPlugin(): Plugin
{
	return {
		name: 'tab-indent',
		generateBundle(_options, bundle)
		{
			for (const [fileName, chunk] of Object.entries(bundle))
			{
				if (chunk.type === 'chunk')
				{
					(chunk as OutputChunk).code = convertIndent(chunk.code);
				}
				else if (chunk.type === 'asset' && fileName.endsWith('.js') && typeof chunk.source === 'string')
				{
					(chunk as OutputAsset).source = convertIndent(chunk.source);
				}
			}
		},
	};
}
