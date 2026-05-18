import { describe, it } from 'mocha';
import { assert } from 'chai';

import { buildBcdIndex } from '../../src/modules/baseline/bcd-index';
import { extractFeatureUsages } from '../../src/modules/baseline/ast-walker';

const index = buildBcdIndex();

function syntaxFeatures(code: string): string[]
{
	return extractFeatureUsages(code, '/src/app.js', index)
		.filter((u) => u.kind === 'syntax')
		.map((u) => u.label);
}

describe('baseline / syntax-map', () => {
	describe('optional chaining (?.)', () => {
		it('detects member access', () => {
			const labels = syntaxFeatures('const v = a?.b;');
			assert.isTrue(labels.some((l) => l.toLowerCase().includes('optional chaining')));
		});

		it('detects function call', () => {
			const labels = syntaxFeatures('const v = a?.b?.();');
			assert.isTrue(labels.some((l) => l.toLowerCase().includes('optional chaining')));
		});

		it('detects bracket access', () => {
			const labels = syntaxFeatures('const v = a?.[0];');
			assert.isTrue(labels.some((l) => l.toLowerCase().includes('optional chaining')));
		});
	});

	describe('nullish coalescing (??)', () => {
		it('detects ?? operator', () => {
			const labels = syntaxFeatures('const v = a ?? b;');
			assert.isTrue(labels.some((l) => l.toLowerCase().includes('nullish coalescing')));
		});

		it('does NOT match logical OR', () => {
			const labels = syntaxFeatures('const v = a || b;');
			assert.isFalse(labels.some((l) => l.toLowerCase().includes('nullish')));
		});
	});

	describe('logical assignment operators', () => {
		it('detects ??=', () => {
			const labels = syntaxFeatures('a ??= b;');
			assert.isTrue(labels.some((l) => l.includes('??=')));
		});

		it('detects ||=', () => {
			const labels = syntaxFeatures('a ||= b;');
			assert.isTrue(labels.some((l) => l.includes('||=')));
		});

		it('detects &&=', () => {
			const labels = syntaxFeatures('a &&= b;');
			assert.isTrue(labels.some((l) => l.includes('&&=')));
		});

		it('does NOT match plain assignment', () => {
			const labels = syntaxFeatures('a = b;');
			assert.lengthOf(labels.filter((l) => l.includes('=')), 0);
		});
	});

	describe('exponentiation (**)', () => {
		it('detects ** operator', () => {
			const labels = syntaxFeatures('const v = 2 ** 10;');
			assert.isTrue(labels.some((l) => l.includes('exponentiation')));
		});

		it('does NOT match multiplication', () => {
			const labels = syntaxFeatures('const v = 2 * 10;');
			assert.lengthOf(labels.filter((l) => l.includes('exponentiation')), 0);
		});
	});

	describe('spread operator', () => {
		it('detects array spread', () => {
			const labels = syntaxFeatures('const a = [...b, ...c];');
			assert.isTrue(labels.some((l) => l.toLowerCase().includes('spread')));
		});

		it('detects function call spread', () => {
			const labels = syntaxFeatures('fn(...args);');
			assert.isTrue(labels.some((l) => l.toLowerCase().includes('spread')));
		});
	});

	describe('combined / nested syntax features', () => {
		it('reports all features used in the same expression', () => {
			const labels = syntaxFeatures('const v = a?.b ?? c;');
			assert.isTrue(labels.some((l) => l.toLowerCase().includes('optional chaining')));
			assert.isTrue(labels.some((l) => l.toLowerCase().includes('nullish coalescing')));
		});

		it('handles deeply nested combinations', () => {
			const code = 'const x = obj?.[key]?.method?.(...args) ?? fallback;';
			const labels = syntaxFeatures(code);
			assert.isTrue(labels.some((l) => l.toLowerCase().includes('optional chaining')));
			assert.isTrue(labels.some((l) => l.toLowerCase().includes('nullish coalescing')));
			assert.isTrue(labels.some((l) => l.toLowerCase().includes('spread')));
		});
	});
});
