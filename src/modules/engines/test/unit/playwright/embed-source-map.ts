import type { SourceMap } from 'rollup';

export function embedSourceMap(code: string, sourceMap: SourceMap): string
{
	const mapWithFileUrls = {
		...sourceMap,
		sources: (sourceMap.sources ?? []).map((source: string) => {
			if (source.startsWith('/'))
			{
				return `file://${source}`;
			}

			return source;
		}),
	};

	return code
		+ '\n//# sourceURL=chef-test-bundle.js'
		+ '\n//# sourceMappingURL=data:application/json;base64,'
		+ Buffer.from(JSON.stringify(mapWithFileUrls)).toString('base64');
}
