import { describe, it } from 'mocha';
import { assert } from 'chai';

import { renderDiff } from '../../src/diagnostics/render-diff';
import { stripAnsi } from '../../src/diagnostics/code-frame';

describe('renderDiff', () => {
	describe('scalar values', () => {
		it('should render string Expected/Received', () => {
			const result = renderDiff('actual', 'expected');
			const plain = result.map(stripAnsi);

			assert.isTrue(plain.some((l) => l.includes('Expected') && l.includes('expected')));
			assert.isTrue(plain.some((l) => l.includes('Received') && l.includes('actual')));
		});

		it('should render number Expected/Received', () => {
			const result = renderDiff(42, 100);
			const plain = result.map(stripAnsi);

			assert.isTrue(plain.some((l) => l.includes('Expected') && l.includes('100')));
			assert.isTrue(plain.some((l) => l.includes('Received') && l.includes('42')));
		});

		it('should render boolean values', () => {
			const result = renderDiff(false, true);
			const plain = result.map(stripAnsi);

			assert.isTrue(plain.some((l) => l.includes('Expected') && l.includes('true')));
			assert.isTrue(plain.some((l) => l.includes('Received') && l.includes('false')));
		});

		it('should render null/undefined', () => {
			const result = renderDiff(null, undefined);
			const plain = result.map(stripAnsi);

			assert.isTrue(plain.some((l) => l.includes('Expected')));
			assert.isTrue(plain.some((l) => l.includes('Received')));
		});
	});

	describe('object values', () => {
		it('should render line-by-line diff for objects', () => {
			const result = renderDiff({ a: 1, b: 2 }, { a: 1, b: 3 });
			const plain = result.map(stripAnsi);

			assert.isTrue(plain.some((l) => l.includes('- Expected')));
			assert.isTrue(plain.some((l) => l.includes('+ Received')));
		});

		it('should show matching lines without markers', () => {
			const result = renderDiff({ a: 1 }, { a: 2 });
			const plain = result.map(stripAnsi);

			// Opening brace should be the same
			assert.isTrue(plain.some((l) => l.includes('{')));
		});

		it('should render array diff', () => {
			const result = renderDiff([1, 2, 3], [1, 2, 4]);
			const plain = result.map(stripAnsi);

			assert.isTrue(plain.some((l) => l.includes('- Expected')));
			assert.isTrue(plain.some((l) => l.includes('+ Received')));
		});
	});

	describe('color coding', () => {
		it('should use green for Expected', () => {
			const result = renderDiff('actual', 'expected');

			const expectedLine = result.find((l) => stripAnsi(l).includes('Expected'));
			assert.isDefined(expectedLine);
			assert.include(expectedLine!, '\x1B[32m'); // green
		});

		it('should use red for Received', () => {
			const result = renderDiff('actual', 'expected');

			const receivedLine = result.find((l) => stripAnsi(l).includes('Received'));
			assert.isDefined(receivedLine);
			assert.include(receivedLine!, '\x1B[31m'); // red
		});
	});
});
