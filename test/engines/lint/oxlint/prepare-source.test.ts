import { describe, it } from 'mocha';
import { assert } from 'chai';

import { prepareSource, shadowName } from '../../../../src/modules/engines/lint/oxlint/prepare-source';

describe('prepareSource', () => {
	it('keeps plain JavaScript in place', () => {
		assert.deepEqual(prepareSource('/a/b.js', 'const a = 1;\n'), { kind: 'native' });
	});

	it('keeps valid TypeScript in place', () => {
		assert.deepEqual(prepareSource('/a/b.ts', 'const a: number = 1;\n'), { kind: 'native' });
	});

	it('lints Flow as TypeScript, blanking the ? of maybe types', () => {
		const text = 'function f(a: ?string): ?number\n{\n\treturn 1;\n}\n';
		const prepared = prepareSource('/a/b.js', text);

		assert.equal(prepared.kind, 'flow-as-ts');
		if (prepared.kind === 'flow-as-ts')
		{
			assert.equal(prepared.text, text.replaceAll('?', ' '));
			assert.deepEqual(prepared.changed, [text.indexOf('?'), text.lastIndexOf('?')]);
			assert.equal(prepared.text.length, text.length);
		}
	});

	it('fixes Flow maybe types in TypeScript files', () => {
		const prepared = prepareSource('/a/b.ts', 'let a: ?string = null;\n');

		assert.equal(prepared.kind, 'ts-fixed');
	});

	it('blanks out types Flow-only syntax keeps from parsing as TypeScript', () => {
		const text = 'type A = {| a: string |};\nconst b: A = { a: "1" };\n';
		const prepared = prepareSource('/a/b.js', text);

		assert.equal(prepared.kind, 'stripped');
		if (prepared.kind === 'stripped')
		{
			assert.equal(prepared.text.length, text.length);
			assert.notInclude(prepared.text, 'type A');
		}
	});

	it('does not read the Flow indexer as a TypeScript computed key', () => {
		const text = 'const map: {[string]: number} = {};\n';
		const prepared = prepareSource('/a/b.js', text);

		assert.equal(prepared.kind, 'flow-as-ts');
		if (prepared.kind === 'flow-as-ts')
		{
			assert.equal(prepared.text, 'const map: { string : number} = {};\n');
			assert.deepEqual(prepared.changed, [text.indexOf('['), text.indexOf(']')]);
		}
	});

	it('knows where the type annotations are', () => {
		const text = 'type A = {a: string};\nconst b: A = {a: \'1\'};\n';
		const prepared = prepareSource('/a/b.js', text);

		assert.equal(prepared.kind, 'flow-as-ts');
		if (prepared.kind === 'flow-as-ts')
		{
			assert.deepEqual(
				prepared.typeRanges.map(([start, end]) => text.slice(start, end)).sort(),
				[': A', 'type A = {a: string};'],
			);
		}
	});

	it('reports what nothing parses', () => {
		const prepared = prepareSource('/a/b.js', 'const = ;\n');

		assert.equal(prepared.kind, 'unparsable');
	});

	it('reports the error that keeps a Flow file from parsing, not its first type', () => {
		const text = "export class A\n{\n\tid: ?string = null;\n\tparse(s: string)\n\t{\n\t\treturn s.replace(/x/, '\\001');\n\t}\n}\n";
		const prepared = prepareSource('/a/b.js', text);

		assert.equal(prepared.kind, 'unparsable');
		assert.equal(prepared.kind === 'unparsable' && text.slice(0, prepared.offset).split('\n').length, 6);
	});

	it('reads Flow typeof imports as type imports', () => {
		const text = "import { typeof A, B } from 'x';\nimport typeof C from 'y';\nexport function f(a: A, c: C): ?B { return null; }\n";
		const prepared = prepareSource('/a/b.js', text);

		assert.equal(prepared.kind, 'flow-as-ts');
		assert.equal(
			prepared.kind === 'flow-as-ts' && prepared.text,
			"import { type   A, B } from 'x';\nimport type   C from 'y';\nexport function f(a: A, c: C):  B { return null; }\n",
		);
	});

	it('blanks the Flow annotations TypeScript rejects in valid syntax', () => {
		const text = [
			'export class A',
			'{',
			'\tconstructor(): void {}',
			'\tset value(v: string): void {}',
			'\tf(items: Array<string>) { for (const item: string of items) {} }',
			'}',
			'export function g(a?: string, b: number) { return [a, b]; }',
			'',
		].join('\n');
		const prepared = prepareSource('/a/b.js', text);

		assert.equal(prepared.kind, 'flow-as-ts');
		assert.equal(prepared.kind === 'flow-as-ts' && prepared.text, [
			'export class A',
			'{',
			'\tconstructor()       {}',
			'\tset value(v: string)       {}',
			'\tf(items: Array<string>) { for (const item         of items) {} }',
			'}',
			'export function g(a : string, b: number) { return [a, b]; }',
			'',
		].join('\n'));
	});

	it('names the TypeScript copy of a Flow file *.js.ts', () => {
		assert.equal(shadowName('x/b.js', { kind: 'flow-as-ts', text: '', changed: [], typeRanges: [] }), 'x/b.js.ts');
		assert.equal(shadowName('x/b.js', { kind: 'stripped', text: '', changed: [] }), 'x/b.js');
	});
});
