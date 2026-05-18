import { describe, it } from 'mocha';
import { assert } from 'chai';

import { checkCode } from '../../src/modules/baseline/checker';

// Targets that are about a year out of date — capture most recent additions.
const olderTargets = ['chrome 109', 'firefox 115', 'safari 16.4'];

// Targets ancient enough to catch even early-2020s features.
const ancientTargets = ['chrome 70', 'firefox 70', 'safari 13'];

// Bleeding-edge targets — almost everything should pass.
const modernTargets = ['chrome 140', 'firefox 140', 'safari 18.4'];

function check(code: string, targets: string[], id = '/src/app.js')
{
	return checkCode({ code, id, targets });
}

function expectWarning(code: string, targets: string[], expectedSubstring: string): void
{
	const warnings = check(code, targets);
	const matched = warnings.find((w) => w.message.includes(expectedSubstring));
	assert.isOk(matched, `expected warning containing "${expectedSubstring}", got: ${JSON.stringify(warnings.map((w) => w.message))}`);
}

function expectNoWarning(code: string, targets: string[]): void
{
	const warnings = check(code, targets);
	assert.deepEqual(warnings, [], `expected no warnings, got: ${JSON.stringify(warnings.map((w) => w.message))}`);
}

describe('baseline / api coverage', () => {
	describe('static methods — should warn on old targets', () => {
		// Each case: code, the targets where it MUST warn, and the substring expected.
		const cases: Array<[label: string, code: string, warnTargets: string[]]> = [
			['RegExp.escape', 'const r = RegExp.escape("x");', olderTargets],
			['Promise.try', 'Promise.try(fn);', olderTargets],
			['Object.groupBy', 'const g = Object.groupBy(arr, k);', olderTargets],
			['Map.groupBy', 'const g = Map.groupBy(arr, k);', olderTargets],
			['Iterator.from', 'Iterator.from(arr);', olderTargets],
			['Array.fromAsync', 'await Array.fromAsync(iter);', olderTargets],
			// These older static APIs need genuinely ancient targets to fail.
			['Object.hasOwn', 'Object.hasOwn(o, "k");', ['chrome 90']],
			['Promise.allSettled', 'Promise.allSettled(arr);', ['chrome 70']],
			['Promise.any', 'Promise.any(arr);', ['chrome 80']],
			['Promise.withResolvers', 'Promise.withResolvers();', ['chrome 115']],
		];

		for (const [label, code, warnTargets] of cases)
		{
			it(`warns on ${label} with appropriate old targets`, () => {
				expectWarning(code, warnTargets, label.split('.')[1] ?? label);
			});

			it(`is silent on ${label} with modern targets`, () => {
				expectNoWarning(code, modernTargets);
			});
		}
	});

	describe('constructors — should warn on ancient targets', () => {
		const cases: Array<[label: string, code: string]> = [
			['WeakRef', 'new WeakRef(o);'],
			['AggregateError', 'throw new AggregateError([], "m");'],
			['FinalizationRegistry', 'new FinalizationRegistry(cb);'],
		];

		for (const [label, code] of cases)
		{
			it(`warns on new ${label} with ancient targets`, () => {
				expectWarning(code, ancientTargets, label);
			});
		}
	});

	describe('global APIs — should warn on ancient targets', () => {
		it('warns on structuredClone', () => {
			expectWarning('structuredClone(o);', ancientTargets, 'structuredClone');
		});

		it('warns on queueMicrotask only on very old targets', () => {
			expectWarning('queueMicrotask(fn);', ['chrome 60', 'firefox 60', 'safari 11'], 'queueMicrotask');
		});

		it('does not warn on console.log', () => {
			expectNoWarning('console.log("x");', ancientTargets);
		});
	});

	describe('instance methods — only warn when ALL owners are unsupported', () => {
		it('warns on .at() — added across owners around the same time', () => {
			expectWarning('arr.at(0);', ['chrome 90', 'firefox 90', 'safari 14'], '.at()');
		});

		it('warns on .toSorted() — Array/TypedArray newer', () => {
			expectWarning('arr.toSorted();', ['safari 14'], 'toSorted');
		});

		it('warns on .replaceAll() — String only', () => {
			expectWarning('"x".replaceAll("a", "b");', ['chrome 80'], 'replaceAll');
		});

		it('does NOT warn on .map() — Array.prototype.map is ancient', () => {
			// Even though Iterator.prototype.map is new, Array.prototype.map dates
			// back to ES5 and is supported everywhere.
			expectNoWarning('[1, 2, 3].map(x => x * 2);', olderTargets);
		});

		it('does NOT warn on .filter() — Array.prototype.filter is ancient', () => {
			expectNoWarning('arr.filter(x => x > 0);', olderTargets);
		});

		it('does NOT warn on .forEach() — Array.prototype.forEach is ancient', () => {
			expectNoWarning('arr.forEach(x => fn(x));', olderTargets);
		});

		it('does NOT warn on .some() — Array.prototype.some is ancient', () => {
			expectNoWarning('arr.some(x => x);', olderTargets);
		});

		it('does NOT warn on .every() — Array.prototype.every is ancient', () => {
			expectNoWarning('arr.every(x => x);', olderTargets);
		});

		it('does NOT warn on .find() — Array.prototype.find supported since ES2015', () => {
			expectNoWarning('arr.find(x => x);', olderTargets);
		});

		it('does NOT warn on .reduce() — Array.prototype.reduce is ancient', () => {
			expectNoWarning('arr.reduce((a, b) => a + b, 0);', olderTargets);
		});

		it('does NOT warn on .includes() — Array.prototype.includes since ES2016', () => {
			expectNoWarning('arr.includes(x);', olderTargets);
		});

		it('does NOT warn on .entries() — Array.prototype.entries is old', () => {
			expectNoWarning('for (const e of arr.entries()) {}', olderTargets);
		});
	});

	describe('false positives that MUST NOT fire', () => {
		it('shadowed Promise.allSettled — no warning', () => {
			expectNoWarning('const Promise = bb; Promise.allSettled([]);', ancientTargets);
		});

		it('shadowed structuredClone in import', () => {
			expectNoWarning('import { structuredClone } from "mylib"; structuredClone(o);', ancientTargets);
		});

		it('API name inside string literal', () => {
			expectNoWarning('const s = "RegExp.escape and structuredClone";', olderTargets);
		});

		it('API name inside template literal', () => {
			expectNoWarning('const s = `${"Promise.try"}`;', olderTargets);
		});

		it('API name inside JSDoc', () => {
			const code = [
				'/** @returns {Promise<void>} structuredClone polyfill */',
				'function f() {}',
			].join('\n');
			expectNoWarning(code, olderTargets);
		});

		it('custom class shadowing constructor', () => {
			expectNoWarning('class WeakRef {} new WeakRef(x);', ancientTargets);
		});

		it('property access mid-chain — only outer object is checked', () => {
			// `obj.RegExp.escape(...)` is NOT a use of the global RegExp.escape.
			expectNoWarning('obj.RegExp.escape("x");', olderTargets);
		});

		it('renamed local — alias does not match', () => {
			expectNoWarning('const myEscape = (s) => s; myEscape("x");', olderTargets);
		});
	});

	describe('file extensions — same checks apply uniformly', () => {
		const cases = ['/src/app.js', '/src/app.mjs', '/src/app.cjs', '/src/app.ts', '/src/app.tsx', '/src/app.jsx', '/src/app.mts', '/src/app.cts'];

		for (const id of cases)
		{
			it(`detects RegExp.escape in ${id}`, () => {
				const warnings = check('const r = RegExp.escape("x");', olderTargets, id);
				assert.isAbove(warnings.length, 0);
			});
		}

		it('skips files inside node_modules', () => {
			const w = check('RegExp.escape("x");', olderTargets, '/project/node_modules/lib/index.js');
			assert.deepEqual(w, []);
		});

		it('skips unsupported file extensions', () => {
			const w = check('RegExp.escape("x");', olderTargets, '/src/data.json');
			assert.deepEqual(w, []);
		});
	});

	describe('reported message format', () => {
		it('uses "() is not supported" for static and global APIs', () => {
			const w = check('RegExp.escape("x");', olderTargets);
			assert.equal(w.length, 1);
			assert.include(w[0].message, 'RegExp.escape()');
			assert.include(w[0].message, 'is not supported');
		});

		it('uses "may not be supported" for instance methods', () => {
			const w = check('arr.at(0);', ['safari 14']);
			assert.isAbove(w.length, 0);
			assert.include(w[0].message, 'may not be supported');
		});

		it('does NOT add () for constructors (it is `new X`, not `new X()`)', () => {
			const w = check('new WeakRef(o);', ancientTargets);
			assert.isAbove(w.length, 0);
			// Format: "WeakRef is not supported" — no parentheses.
			assert.notInclude(w[0].message, 'WeakRef()');
			assert.include(w[0].message, 'WeakRef is not supported');
		});

		it('includes unsupported browser names', () => {
			const w = check('RegExp.escape("x");', ['chrome 100']);
			assert.isAbove(w.length, 0);
			assert.include(w[0].message, 'Chrome');
		});
	});
});
