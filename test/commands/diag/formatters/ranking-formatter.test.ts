import { assert } from 'chai';

import { formatRanking } from '../../../../src/commands/diag/formatters/ranking-formatter';

function stripAnsi(str: string): string
{
	return str.replace(/\x1B\[[0-9;]*m/g, '');
}

describe('formatRanking', () => {
	it('should format items with rank numbers', () => {
		const output = formatRanking({
			items: [
				{ name: 'first', count: 10 },
				{ name: 'second', count: 5 },
			],
			columns: [
				{ label: 'Name', value: (item) => item.name },
				{ label: 'Count', value: (item) => String(item.count), align: 'right' },
			],
			scanned: 100,
			duration: 2340,
		});

		const plain = stripAnsi(output);

		assert.include(plain, '1');
		assert.include(plain, '2');
		assert.include(plain, 'first');
		assert.include(plain, 'second');
		assert.include(plain, '10');
		assert.include(plain, '5');
	});

	it('should show no results message when empty', () => {
		const output = formatRanking({
			items: [],
			columns: [
				{ label: 'Name', value: (item) => item.name },
			],
			scanned: 50,
			duration: 1000,
		});

		const plain = stripAnsi(output);

		assert.include(plain, 'No results found');
	});

	it('should include footer with scan stats', () => {
		const output = formatRanking({
			items: [{ name: 'a' }],
			columns: [
				{ label: 'Name', value: (item) => item.name },
			],
			scanned: 200,
			duration: 3500,
		});

		const plain = stripAnsi(output);

		assert.include(plain, 'Scanned 200 extensions');
		assert.include(plain, '3.50s');
	});

	it('should handle multiline cell values', () => {
		const output = formatRanking({
			items: [{ name: 'test', details: 'line1\nline2' }],
			columns: [
				{ label: 'Name', value: (item) => item.name },
				{ label: 'Details', value: (item) => item.details },
			],
			scanned: 10,
			duration: 100,
		});

		const plain = stripAnsi(output);

		assert.include(plain, 'line1');
		assert.include(plain, 'line2');
	});

	it('should include column headers', () => {
		const output = formatRanking({
			items: [{ x: 1 }],
			columns: [
				{ label: 'Extension', value: () => 'a' },
				{ label: 'Size', value: () => '100', align: 'right' },
			],
			scanned: 1,
			duration: 10,
		});

		const plain = stripAnsi(output);

		assert.include(plain, 'Extension');
		assert.include(plain, 'Size');
	});
});
