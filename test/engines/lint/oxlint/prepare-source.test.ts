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
		const prepared = prepareSource('/a/b.js', 'const map: {[string]: number} = {};\n');

		assert.equal(prepared.kind, 'stripped');
	});

	it('reports what nothing parses', () => {
		const prepared = prepareSource('/a/b.js', 'const = ;\n');

		assert.equal(prepared.kind, 'unparsable');
	});

	it('names the TypeScript copy of a Flow file *.js.ts', () => {
		assert.equal(shadowName('x/b.js', { kind: 'flow-as-ts', text: '', changed: [] }), 'x/b.js.ts');
		assert.equal(shadowName('x/b.js', { kind: 'stripped', text: '', changed: [] }), 'x/b.js');
	});
});
