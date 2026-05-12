import { isAbsoluteAnyPlatform, normalizePath } from '../../../../../utils/path/normalize';

import type { SourceMap } from 'rollup';

function toAbsoluteFileUrl(source: string): string | null
{
	if (!isAbsoluteAnyPlatform(source))
	{
		return null;
	}

	const posix = normalizePath(source);
	// POSIX absolute paths already start with "/"; Windows drive-letter paths
	// need the third slash to form a valid file:/// URL.
	return posix.startsWith('/') ? `file://${posix}` : `file:///${posix}`;
}

export function embedSourceMap(code: string, sourceMap: SourceMap): string
{
	const mapWithFileUrls = {
		...sourceMap,
		sources: (sourceMap.sources ?? []).map((source: string) => {
			return toAbsoluteFileUrl(source) ?? source;
		}),
	};

	return code
		+ '\n//# sourceURL=chef-test-bundle.js'
		+ '\n//# sourceMappingURL=data:application/json;base64,'
		+ Buffer.from(JSON.stringify(mapWithFileUrls)).toString('base64');
}
