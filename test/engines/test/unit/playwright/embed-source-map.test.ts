import { describe, it } from 'mocha';
import { assert } from 'chai';

import { embedSourceMap } from '../../../../../src/modules/engines/test/unit/playwright/embed-source-map';

describe('embedSourceMap', () => {
	it('should append sourceURL and sourceMappingURL comments', () => {
		const code = 'console.log("test");';
		const sourceMap = {
			version: 3,
			sources: ['/src/app.ts'],
			names: [],
			mappings: 'AAAA',
		} as any;

		const result = embedSourceMap(code, sourceMap);

		assert.include(result, code);
		assert.include(result, '//# sourceURL=chef-test-bundle.js');
		assert.include(result, '//# sourceMappingURL=data:application/json;base64,');
	});

	it('should convert absolute paths to file:// URLs in sources', () => {
		const sourceMap = {
			version: 3,
			sources: ['/src/app.ts', '/src/utils.ts'],
			names: [],
			mappings: 'AAAA',
		} as any;

		const result = embedSourceMap('code', sourceMap);

		const base64 = result.split('base64,')[1];
		const decoded = JSON.parse(Buffer.from(base64, 'base64').toString());

		assert.deepEqual(decoded.sources, ['file:///src/app.ts', 'file:///src/utils.ts']);
	});

	it('should preserve relative paths as-is', () => {
		const sourceMap = {
			version: 3,
			sources: ['./src/app.ts', '../utils.ts'],
			names: [],
			mappings: 'AAAA',
		} as any;

		const result = embedSourceMap('code', sourceMap);

		const base64 = result.split('base64,')[1];
		const decoded = JSON.parse(Buffer.from(base64, 'base64').toString());

		assert.deepEqual(decoded.sources, ['./src/app.ts', '../utils.ts']);
	});

	it('should handle empty sources array', () => {
		const sourceMap = {
			version: 3,
			sources: [],
			names: [],
			mappings: '',
		} as any;

		const result = embedSourceMap('code', sourceMap);

		const base64 = result.split('base64,')[1];
		const decoded = JSON.parse(Buffer.from(base64, 'base64').toString());

		assert.deepEqual(decoded.sources, []);
	});

	it('should produce valid base64-encoded JSON', () => {
		const sourceMap = {
			version: 3,
			sources: ['/src/app.ts'],
			names: ['foo'],
			mappings: 'AAAA;AACA',
		} as any;

		const result = embedSourceMap('code', sourceMap);

		const base64 = result.split('base64,')[1];
		const decoded = JSON.parse(Buffer.from(base64, 'base64').toString());

		assert.equal(decoded.version, 3);
		assert.deepEqual(decoded.names, ['foo']);
		assert.equal(decoded.mappings, 'AAAA;AACA');
	});
});
