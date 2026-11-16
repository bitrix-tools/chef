import { describe, it } from 'mocha';
import { assert } from 'chai';

import { checkCode } from '../../src/modules/baseline/checker';

// Below DisposableStack, Iterator helpers, Set methods, resizable ArrayBuffer and Array.prototype.toSorted.
const olderTargets = ['chrome 109', 'firefox 115', 'safari 16.4'];

function messages(code: string, id = '/src/app.js', targets = olderTargets): string[]
{
	return checkCode({ code, id, targets }).map((warning) => warning.message);
}

function expectWarning(code: string, expectedSubstring: string, id?: string, targets?: string[]): void
{
	const found = messages(code, id, targets);
	assert.isOk(
		found.some((message) => message.includes(expectedSubstring)),
		`expected a warning containing "${expectedSubstring}", got: ${JSON.stringify(found)}`,
	);
}

function expectNoWarning(code: string, id?: string, targets?: string[]): void
{
	assert.deepEqual(messages(code, id, targets), []);
}

describe('baseline / receiver analysis', () => {
	describe('unknown receivers', () => {
		it('does not take a namespace method for DisposableStack.prototype.defer', () => {
			expectNoWarning('BX.defer(callback);');
		});

		it('does not take an application method for DisposableStack.prototype.use', () => {
			expectNoWarning('app.use(plugin).mount(container);');
		});

		it('does not take a query method for Iterator.prototype.toArray', () => {
			expectNoWarning('db.table.where("id").equals(id).toArray((rows) => rows);');
		});

		it('still checks methods of common builtins', () => {
			expectWarning('items.toSorted();', '.toSorted()');
		});
	});

	describe('receivers proven to be a builtin', () => {
		it('checks a variable bound to a constructed DisposableStack', () => {
			expectWarning('const stack = new DisposableStack();\nstack.defer(callback);', '.defer()');
		});

		it('checks an iterator returned by keys()', () => {
			expectWarning('map.keys().drop(1);', '.drop()');
		});

		it('checks an iterator created by Iterator.from()', () => {
			expectWarning('Iterator.from(source).take(2);', '.take()');
		});

		it('checks a parameter annotated as an iterator', () => {
			expectWarning('function collect(it: Iterator<number>) { return it.toArray(); }', '.toArray()', '/src/app.ts');
		});

		it('checks a class field initialized with an ArrayBuffer', () => {
			const code = [
				'class Storage {',
				'  #buffer = new ArrayBuffer(8, { maxByteLength: 16 });',
				'  grow() { this.#buffer.resize(16); }',
				'}',
			].join('\n');
			expectWarning(code, '.resize()');
		});

		it('checks a parameter annotated as an array', () => {
			expectWarning('function sort(list: Item[]) { return list.toSorted(); }', '.toSorted()', '/src/app.ts');
		});

		it('checks this inside a class extending a builtin', () => {
			expectWarning('class Sorted extends Array { sorted() { return this.toSorted(); } }', '.toSorted()');
		});
	});

	describe('receivers proven not to be a builtin', () => {
		it('skips this inside a class', () => {
			expectNoWarning('class List { toSorted() {} sort() { return this.toSorted(); } }');
		});

		it('skips an instance of a module class', () => {
			expectNoWarning('const list = new ItemList();\nlist.toSorted();');
		});

		it('skips a class field holding an instance of a module class', () => {
			expectNoWarning('class Box { #items = new ItemList(); sorted() { return this.#items.toSorted(); } }');
		});

		it('skips a parameter annotated with a product type', () => {
			expectNoWarning('function sort(list: ItemList) { return list.toSorted(); }', '/src/app.ts');
		});

		it('skips this in a Flow module parsed by Babel', () => {
			const code = [
				'class List {',
				'  toSorted() {}',
				'  sort(item: ?Item) { return this.toSorted(); }',
				'}',
			].join('\n');
			expectNoWarning(code);
		});

		it('checks a variable that may also hold an unknown value', () => {
			expectWarning('const list = condition ? new ItemList() : items;\nlist.toSorted();', '.toSorted()');
		});

		it('checks this of a regular function nested in a class method', () => {
			expectWarning('class A { m() { return function () { return this.toSorted(); }; } }', '.toSorted()');
		});

		it('checks an annotated array in a Flow module parsed by Babel', () => {
			expectWarning('function sort(list: Array<string>, item: ?Item) { return list.toSorted(); }', '.toSorted()');
		});
	});

	describe('feature detection', () => {
		it('skips a global called under a typeof check', () => {
			expectNoWarning('if (typeof structuredClone === "function") { structuredClone(value); }', undefined, ['chrome 90']);
		});

		it('skips a static method called under a conditional', () => {
			expectNoWarning('const pair = Promise.withResolvers ? Promise.withResolvers() : createDeferred();');
		});

		it('skips an instance method called under a function check', () => {
			const code = [
				'function isEqual(a: Set<string>, b: Set<string>) {',
				'  if (Type.isFunction(a.symmetricDifference)) { return a.symmetricDifference(b).size === 0; }',
				'  return false;',
				'}',
			].join('\n');
			expectNoWarning(code, '/src/app.ts');
		});

		it('skips an instance method called under an in check', () => {
			expectNoWarning('if ("toSorted" in items) { items.toSorted(); }');
		});

		it('skips a method called after an && check', () => {
			expectNoWarning('const sorted = items.toSorted && items.toSorted();');
		});

		it('checks a usage outside the guarded branch', () => {
			expectWarning('if (window.structuredClone) {}\nstructuredClone(value);', 'structuredClone', undefined, ['chrome 90']);
		});

		it('does not take a call in the condition for a check', () => {
			const found = messages('if (items.toSorted().length) { items.toSorted(); }');
			assert.lengthOf(found.filter((message) => message.includes('.toSorted()')), 2);
		});
	});
});
