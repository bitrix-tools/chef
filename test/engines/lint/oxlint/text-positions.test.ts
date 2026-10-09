import { describe, it } from 'mocha';
import { assert } from 'chai';

import { TextPositions } from '../../../../src/modules/engines/lint/oxlint/text-positions';

describe('TextPositions', () => {
	const text = '// Привет\nconst x = \'тест\'; debugger;\n';
	const positions = new TextPositions(text);

	it('converts UTF-8 byte offsets to UTF-16 indices', () => {
		const index = text.indexOf('debugger');

		assert.equal(positions.indexOfByteOffset(Buffer.byteLength(text.slice(0, index))), index);
	});

	it('gives 1-based lines and UTF-16 columns', () => {
		assert.deepEqual(positions.locationOf(text.indexOf('debugger')), { line: 2, column: 19 });
		assert.deepEqual(positions.locationOf(0), { line: 1, column: 1 });
	});
});
