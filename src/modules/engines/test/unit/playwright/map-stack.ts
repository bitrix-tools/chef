import * as path from 'node:path';

import { originalPositionFor, type TraceMap } from '@jridgewell/trace-mapping';

// Match bundle frames including the full URL prefix:
// Chromium: "at fn (<anonymous>:53:13)"
// Firefox: "@http://host/dev/ui/cli/mocha-wrapper.php:53:13"
// WebKit: "http://host/dev/ui/cli/mocha-wrapper.php:53:13"
const bundleFramePattern = /(?:https?:\/\/\S*)?(?:<anonymous>|injectedScript|mocha-wrapper\.php):(\d+):(\d+)/g;

export function mapStack(stack: string, tracer: TraceMap): string
{
	return stack.replace(bundleFramePattern, (match, lineStr: string, colStr: string) => {
		const line = Number(lineStr);
		const column = Number(colStr);

		const pos = originalPositionFor(tracer, { line, column });
		if (pos.source)
		{
			const source = pos.source.startsWith('/')
				? pos.source
				: path.resolve(pos.source);

			return `${source}:${pos.line}:${pos.column + 1}`;
		}

		return match;
	});
}
