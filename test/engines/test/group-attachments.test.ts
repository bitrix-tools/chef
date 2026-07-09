import { describe, it } from 'mocha';
import { assert } from 'chai';

import { groupAttachmentsByBrowser } from '../../../src/modules/engines/test/test-types';

describe('groupAttachmentsByBrowser', () => {
	it('groups attachments by browser, preserving first-seen order', () => {
		const grouped = groupAttachmentsByBrowser([
			{ name: 'screenshot', browser: 'Chromium' },
			{ name: 'trace', browser: 'Chromium' },
			{ name: 'screenshot', browser: 'Firefox' },
			{ name: 'trace', browser: 'Firefox' },
		]);

		assert.deepEqual(grouped.map(([browser]) => browser), ['Chromium', 'Firefox']);
		assert.deepEqual(grouped[0][1].map((a) => a.name), ['screenshot', 'trace']);
		assert.deepEqual(grouped[1][1].map((a) => a.name), ['screenshot', 'trace']);
	});

	it('keeps an undefined browser as its own group', () => {
		const grouped = groupAttachmentsByBrowser([
			{ name: 'a', browser: undefined },
			{ name: 'b', browser: undefined },
		]);

		assert.lengthOf(grouped, 1);
		assert.isUndefined(grouped[0][0]);
		assert.deepEqual(grouped[0][1].map((a) => a.name), ['a', 'b']);
	});

	it('returns an empty array for no attachments', () => {
		assert.deepEqual(groupAttachmentsByBrowser([]), []);
	});
});
