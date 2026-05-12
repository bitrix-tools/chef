import { describe, it } from 'mocha';
import { assert } from 'chai';

import { embedSourceMap } from '../../src/modules/engines/test/unit/playwright/embed-source-map';

// embed-source-map decides whether a source map entry is an absolute path
// (rewrites it to file://...) or a relative path (leaves it alone). The
// current implementation uses `source.startsWith('/')` as the "absolute"
// check, which is incorrect on Windows where absolute paths begin with a
// drive letter. As a result Windows-style absolute source paths are emitted
// without the file:// scheme and stack traces in the unit-test runner do not
// map back to original files.

function decodeEmbeddedMap(code: string): { sources: string[] } | null
{
	const marker = '//# sourceMappingURL=data:application/json;base64,';
	const idx = code.indexOf(marker);
	if (idx === -1)
	{
		return null;
	}
	const base64 = code.slice(idx + marker.length).trim();

	return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

describe('embedSourceMap — absolute paths get file:// scheme on every platform', () => {
	it('rewrites POSIX absolute paths to file:// URLs', () => {
		const map = {
			version: 3,
			sources: ['/home/user/project/src/foo.ts'],
			names: [],
			mappings: '',
			file: 'bundle.js',
			sourcesContent: [],
		} as any;

		const out = embedSourceMap('code', map);
		const decoded = decodeEmbeddedMap(out);
		assert.isNotNull(decoded);
		assert.equal(decoded!.sources[0], 'file:///home/user/project/src/foo.ts');
	});

	it('rewrites Windows absolute paths to file:// URLs', () => {
		// On Windows the source map will contain paths like
		// "C:\\Users\\foo\\src\\bar.ts". The function must recognise this as
		// absolute and emit a file://-style URL.
		const map = {
			version: 3,
			sources: ['C:\\Users\\foo\\src\\bar.ts'],
			names: [],
			mappings: '',
			file: 'bundle.js',
			sourcesContent: [],
		} as any;

		const out = embedSourceMap('code', map);
		const decoded = decodeEmbeddedMap(out);
		assert.isNotNull(decoded);
		assert.match(
			decoded!.sources[0],
			/^file:\/\/\/C:\/Users\/foo\/src\/bar\.ts$/,
			`Windows absolute path must become a file:// URL with forward slashes; got "${decoded!.sources[0]}"`,
		);
	});

	it('leaves relative paths alone', () => {
		const map = {
			version: 3,
			sources: ['src/foo.ts'],
			names: [],
			mappings: '',
			file: 'bundle.js',
			sourcesContent: [],
		} as any;

		const out = embedSourceMap('code', map);
		const decoded = decodeEmbeddedMap(out);
		assert.equal(decoded!.sources[0], 'src/foo.ts');
	});
});
