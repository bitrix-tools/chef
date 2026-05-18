import { describe, it } from 'mocha';
import { assert } from 'chai';

import { buildBcdIndex, loadBcd, formatInstanceOwners } from '../../src/modules/baseline/bcd-index';

describe('baseline / bcd-index', () => {
	const index = buildBcdIndex();
	const bcd = loadBcd();

	describe('size and shape', () => {
		it('builds a populated staticApis map', () => {
			assert.isAbove(index.staticApis.size, 100, 'should index at least 100 static methods');
		});

		it('builds a populated constructors map', () => {
			assert.isAbove(index.constructors.size, 30);
		});

		it('builds a populated globalApis map (Web APIs)', () => {
			assert.isAbove(index.globalApis.size, 500);
		});

		it('builds a populated instanceMethods map', () => {
			assert.isAbove(index.instanceMethods.size, 100);
		});

		it('static map keys follow Owner.member shape', () => {
			for (const key of index.staticApis.keys())
			{
				assert.match(key, /^[A-Za-z]\w*\.\w+$/, `unexpected static key: ${key}`);
			}
		});
	});

	describe('static methods (no hardcoded list)', () => {
		const expectedStatics = [
			'Object.hasOwn',
			'Object.groupBy',
			'Array.from',
			'Array.fromAsync',
			'Array.isArray',
			'Array.of',
			'Promise.allSettled',
			'Promise.any',
			'Promise.withResolvers',
			'Promise.try',
			'Promise.resolve',
			'Map.groupBy',
			'Iterator.from',
			'RegExp.escape',
			'Number.isInteger',
			'Number.isNaN',
			'String.fromCharCode',
			'String.raw',
		];

		for (const key of expectedStatics)
		{
			it(`indexes ${key}`, () => {
				assert.isTrue(index.staticApis.has(key), `${key} should be indexed as static`);
			});
		}

		it('does NOT classify Array.at as a static method', () => {
			assert.isFalse(index.staticApis.has('Array.at'), 'Array.at is an instance method, not static');
		});

		it('does NOT classify String.at as a static method', () => {
			assert.isFalse(index.staticApis.has('String.at'));
		});
	});

	describe('constructors', () => {
		const expectedConstructors = [
			'WeakRef',
			'WeakSet',
			'WeakMap',
			'AggregateError',
			'FinalizationRegistry',
			'Promise',
			'Map',
			'Set',
			'Proxy',
			'Symbol',
		];

		for (const name of expectedConstructors)
		{
			it(`indexes new ${name}`, () => {
				assert.isTrue(index.constructors.has(name), `${name} should be indexed as constructor`);
			});
		}
	});

	describe('global APIs', () => {
		const expectedGlobals = [
			'structuredClone',
			'queueMicrotask',
			'reportError',
			'fetch',
		];

		for (const name of expectedGlobals)
		{
			it(`indexes global ${name}`, () => {
				assert.isTrue(index.globalApis.has(name), `${name} should be indexed as global API`);
			});
		}
	});

	describe('instance methods', () => {
		const expectedInstance = [
			'at',
			'toSorted',
			'toReversed',
			'toSpliced',
			'replaceAll',
			'findLast',
			'findLastIndex',
			'isWellFormed',
			'difference',
			'intersection',
			'union',
			'symmetricDifference',
			'isDisjointFrom',
			'isSubsetOf',
			'isSupersetOf',
		];

		for (const name of expectedInstance)
		{
			it(`indexes .${name}() with at least one owner`, () => {
				const owners = index.instanceMethods.get(name);
				assert.isOk(owners, `.${name}() should be indexed`);
				assert.isAbove(owners!.length, 0);
			});
		}

		it('Array.prototype.some is indexed (multiple owners)', () => {
			const owners = index.instanceMethods.get('some');
			assert.isOk(owners);
			const ownerNames = owners!.map((o) => o.owner);
			assert.include(ownerNames, 'Array');
		});

		it('.at() lists Array, String, TypedArray as owners', () => {
			const owners = index.instanceMethods.get('at');
			const ownerNames = owners!.map((o) => o.owner).sort();
			assert.deepInclude(ownerNames, 'Array');
			assert.deepInclude(ownerNames, 'String');
			assert.deepInclude(ownerNames, 'TypedArray');
		});
	});

	describe('compat data is real', () => {
		it('RegExp.escape entry carries Chrome 136 support', () => {
			const entry = index.staticApis.get('RegExp.escape');
			const chromeSupport = (entry?.__compat?.support?.chrome as any)?.version_added;
			assert.equal(chromeSupport, '136');
		});

		it('Promise.try entry carries support data', () => {
			const entry = index.staticApis.get('Promise.try');
			assert.isOk(entry?.__compat?.support);
		});

		it('matches raw BCD lookup', () => {
			const fromIndex = index.staticApis.get('Object.hasOwn');
			const fromBcd = bcd.javascript.builtins.Object.hasOwn;
			assert.strictEqual(fromIndex, fromBcd);
		});
	});

	describe('formatInstanceOwners()', () => {
		it('joins two owners with " / "', () => {
			const result = formatInstanceOwners('at', [
				{ owner: 'Array', entry: {} },
				{ owner: 'String', entry: {} },
			]);
			assert.equal(result, 'Array.prototype.at / String.prototype.at');
		});

		it('collapses 3+ owners to the first one', () => {
			const result = formatInstanceOwners('at', [
				{ owner: 'Array', entry: {} },
				{ owner: 'String', entry: {} },
				{ owner: 'TypedArray', entry: {} },
			]);
			assert.equal(result, 'Array.prototype.at');
		});
	});
});
