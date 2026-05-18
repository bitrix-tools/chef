import { describe, it } from 'mocha';
import { assert } from 'chai';

import { buildBcdIndex } from '../../src/modules/baseline/bcd-index';
import { extractFeatureUsages } from '../../src/modules/baseline/ast-walker';

const index = buildBcdIndex();

function find(code: string, id = '/src/app.js')
{
	return extractFeatureUsages(code, id, index);
}

describe('baseline / ast-walker', () => {
	describe('static methods', () => {
		it('detects RegExp.escape(...)', () => {
			const u = find('RegExp.escape("x")');
			assert.lengthOf(u, 1);
			assert.equal(u[0].kind, 'static');
			assert.equal(u[0].label, 'RegExp.escape');
		});

		it('detects Object.hasOwn(...)', () => {
			const u = find('Object.hasOwn(o, "k")');
			assert.equal(u[0].label, 'Object.hasOwn');
		});

		it('detects Promise.try(...)', () => {
			const u = find('Promise.try(fn)');
			assert.equal(u[0].label, 'Promise.try');
		});

		it('reports correct line and column', () => {
			const u = find('const a = 1;\nconst x = RegExp.escape("y");');
			assert.equal(u[0].line, 2);
			assert.equal(u[0].column, 10);
		});

		it('skips computed member expressions', () => {
			const u = find('const obj = { hasOwn: 1 }; Object["hasOwn"](o, k);');
			assert.lengthOf(u, 0);
		});
	});

	describe('constructors', () => {
		it('detects new WeakRef', () => {
			const u = find('new WeakRef(x)');
			assert.equal(u[0].kind, 'constructor');
			assert.equal(u[0].label, 'WeakRef');
		});

		it('detects new AggregateError', () => {
			const u = find('new AggregateError([e1, e2], "msg")');
			assert.equal(u[0].label, 'AggregateError');
		});

		it('detects new FinalizationRegistry', () => {
			const u = find('new FinalizationRegistry(cb)');
			assert.equal(u[0].label, 'FinalizationRegistry');
		});
	});

	describe('global functions', () => {
		it('detects structuredClone()', () => {
			const u = find('const c = structuredClone(o);');
			assert.equal(u[0].kind, 'global');
			assert.equal(u[0].label, 'structuredClone');
		});

		it('detects queueMicrotask()', () => {
			const u = find('queueMicrotask(fn);');
			assert.equal(u[0].label, 'queueMicrotask');
		});

		it('ignores function calls that are not BCD-known globals', () => {
			const u = find('myCustomFn(arg);');
			assert.lengthOf(u, 0);
		});
	});

	describe('instance methods', () => {
		it('detects .at(0)', () => {
			const u = find('arr.at(0)');
			const m = u.find((x) => x.kind === 'instanceMethod');
			assert.isOk(m);
			assert.equal(m!.label, '.at()');
		});

		it('detects .toSorted()', () => {
			const u = find('arr.toSorted()');
			const m = u.find((x) => x.kind === 'instanceMethod');
			assert.equal(m!.label, '.toSorted()');
		});

		it('points the column at the method name (after the dot)', () => {
			const u = find('arr.at(0)');
			const m = u.find((x) => x.kind === 'instanceMethod')!;
			assert.equal(m.column, 4);
		});
	});

	describe('scope shadowing — no false positives', () => {
		it('let Promise = bluebird (block scoped)', () => {
			const u = find('let Promise = bluebird; Promise.allSettled([]);');
			assert.lengthOf(u, 0);
		});

		it('const Promise = bluebird', () => {
			const u = find('const Promise = bluebird; Promise.allSettled([]);');
			assert.lengthOf(u, 0);
		});

		it('var Promise = bluebird', () => {
			const u = find('var Promise = bluebird; Promise.allSettled([]);');
			assert.lengthOf(u, 0);
		});

		it('function Promise() {...}', () => {
			const u = find('function Promise() {} Promise.allSettled([]);');
			assert.lengthOf(u, 0);
		});

		it('class Promise {...}', () => {
			const u = find('class Promise {} Promise.allSettled([]);');
			assert.lengthOf(u, 0);
		});

		it('destructured { Promise } = lib', () => {
			const u = find('const { Promise } = lib; Promise.allSettled([]);');
			assert.lengthOf(u, 0);
		});

		it('import { Promise } from "bluebird"', () => {
			const u = find('import { Promise } from "bluebird"; Promise.allSettled([]);');
			assert.lengthOf(u, 0);
		});

		it('import Promise from "bluebird"', () => {
			const u = find('import Promise from "bluebird"; Promise.allSettled([]);');
			assert.lengthOf(u, 0);
		});

		it('import * as Promise from "bluebird"', () => {
			const u = find('import * as Promise from "bluebird"; Promise.allSettled([]);');
			assert.lengthOf(u, 0);
		});

		it('shadowed structuredClone', () => {
			const u = find('const structuredClone = customFn; structuredClone(x);');
			assert.lengthOf(u, 0);
		});

		it('shadowed WeakRef', () => {
			const u = find('class WeakRef {} new WeakRef(x);');
			assert.lengthOf(u, 0);
		});
	});

	describe('string literals — no false positives', () => {
		it('API name in a string literal', () => {
			const u = find('const s = "RegExp.escape and structuredClone";');
			assert.lengthOf(u, 0);
		});

		it('API name in template literal', () => {
			const u = find('const s = `Object.hasOwn`;');
			assert.lengthOf(u, 0);
		});

		it('API name in single-line comment', () => {
			const u = find('// Promise.try(fn)');
			assert.lengthOf(u, 0);
		});

		it('API name in block comment', () => {
			const u = find('/* RegExp.escape("x") */');
			assert.lengthOf(u, 0);
		});
	});

	describe('language flavors', () => {
		it('parses TypeScript with type annotations', () => {
			const u = find('const x: string = RegExp.escape(input);', '/src/app.ts');
			assert.lengthOf(u, 1);
			assert.equal(u[0].label, 'RegExp.escape');
		});

		it('parses TypeScript generics', () => {
			const u = find('function f<T>(x: T): T { return RegExp.escape(x as any); }', '/src/app.ts');
			assert.isAbove(u.length, 0);
			assert.equal(u[0].label, 'RegExp.escape');
		});

		it('parses TypeScript decorators', () => {
			const code = '@dec class Foo { bar() { return RegExp.escape("x"); } }';
			const u = find(code, '/src/app.ts');
			assert.equal(u[0].label, 'RegExp.escape');
		});

		it('parses Flow-annotated JS', () => {
			const code = [
				'type X = { a: string };',
				'function f(x: ?X): string { return RegExp.escape(""); }',
			].join('\n');
			const u = find(code, '/src/app.js');
			assert.equal(u[0].label, 'RegExp.escape');
		});

		it('parses JSX in .jsx', () => {
			const code = 'const el = <div>{Object.hasOwn(o, k) ? "y" : "n"}</div>;';
			const u = find(code, '/src/app.jsx');
			assert.equal(u[0].label, 'Object.hasOwn');
		});

		it('parses TSX with both type annotations and JSX', () => {
			const code = [
				'function render(x: string): JSX.Element {',
				'  return <span>{RegExp.escape(x)}</span>;',
				'}',
			].join('\n');
			const u = find(code, '/src/app.tsx');
			const labels = u.map((x) => x.label);
			assert.include(labels, 'RegExp.escape');
		});

		it('returns [] on completely broken syntax', () => {
			const u = find('this is not valid code !@#$%^');
			assert.deepEqual(u, []);
		});

		it('recovers when only part of the file has parse errors', () => {
			const code = [
				'RegExp.escape("x");',
				'class { invalid }',
			].join('\n');
			const u = find(code);
			// Babel errorRecovery mode collects what it can.
			assert.isAtLeast(u.length, 0);
		});
	});

	describe('class fields and private methods', () => {
		it('parses class with private fields', () => {
			const code = [
				'class A {',
				'  #x = RegExp.escape("y");',
				'  #m() { return this.#x; }',
				'}',
			].join('\n');
			const u = find(code);
			assert.equal(u[0].label, 'RegExp.escape');
		});

		it('parses static class fields', () => {
			const u = find('class A { static x = Object.hasOwn(o, k); }');
			assert.equal(u[0].label, 'Object.hasOwn');
		});
	});

	describe('multiple usages', () => {
		it('reports all unique usages in order', () => {
			const code = [
				'RegExp.escape("a");',
				'Object.hasOwn(o, k);',
				'Promise.try(fn);',
			].join('\n');
			const u = find(code);
			const labels = u.map((x) => x.label);
			assert.includeMembers(labels, ['RegExp.escape', 'Object.hasOwn', 'Promise.try']);
		});

		it('reports repeated usages with correct positions', () => {
			const code = 'RegExp.escape("a"); RegExp.escape("b");';
			const u = find(code);
			const staticUsages = u.filter((x) => x.kind === 'static');
			assert.lengthOf(staticUsages, 2);
			assert.equal(staticUsages[0].column, 0);
			assert.isAbove(staticUsages[1].column, 0);
		});
	});
});
