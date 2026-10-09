import { describe, it } from 'mocha';
import { assert } from 'chai';

import { carryOverEdits, diffText } from '../../../../src/modules/engines/lint/oxlint/text-diff';

function apply(before: string, after: string): string
{
	return carryOverEdits(before, diffText(before, after), [])!.text;
}

describe('diffText', () => {
	it('reproduces the new text', () => {
		const cases: Array<[string, string]> = [
			['', ''],
			['abc', 'abc'],
			['a', ''],
			['', 'a'],
			['const a = 1\n', 'const a = 1;\n'],
			['a\nb\nc\n', 'a\nc\n'],
			['if (a) {\n\tb();\n}\n', 'if (a)\n{\n\tb();\n}\n'],
			['x = "Привет";\n', "x = 'Привет';\n"],
			['😀 a\n', '😀 b\n'],
		];

		for (const [before, after] of cases)
		{
			assert.equal(apply(before, after), after, JSON.stringify([before, after]));
		}
	});

	it('reproduces random edits', () => {
		let seed = 1;
		const random = () => {
			seed = (seed * 16807) % 2147483647;

			return seed / 2147483647;
		};
		const alphabet = 'ab \n;{}';
		for (let i = 0; i < 300; i++)
		{
			const before = Array.from({ length: Math.floor(random() * 40) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
			const after = [...before].map((char) => (random() < 0.15 ? alphabet[Math.floor(random() * alphabet.length)] : char)).join('')
				+ (random() < 0.3 ? 'x' : '');
			assert.equal(apply(before, after), after, JSON.stringify([before, after]));
		}
	});
});

describe('carryOverEdits', () => {
	const original = 'let a: ?string = "x"\n';
	const shadow = original.replace('?', ' ');
	const changed = [original.indexOf('?')];

	it('applies a fix that does not touch transformed positions', () => {
		const fixed = shadow.replace('"x"', "'x'").replace('\n', ';\n');
		const result = carryOverEdits(original, diffText(shadow, fixed), changed);

		assert.equal(result?.text, "let a: ?string = 'x';\n");
		assert.deepEqual(result?.changed, changed);
	});

	it('moves transformed positions along with the edits before them', () => {
		const fixed = `\t${shadow}`;
		const result = carryOverEdits(original, diffText(shadow, fixed), changed);

		assert.equal(result?.text, `\t${original}`);
		assert.deepEqual(result?.changed, [changed[0] + 1]);
	});

	it('skips whitespace fixes of the transformation itself', () => {
		// no-multi-spaces sees `:  string` where the original has `: ?string`
		const fixed = shadow.replace(':  string', ': string').replace('\n', ';\n');
		const result = carryOverEdits(original, diffText(shadow, fixed), changed);

		assert.equal(result?.text, 'let a: ?string = "x";\n');
	});

	it('refuses a fix that rewrites a transformed position', () => {
		const fixed = shadow.replace(':  string', ': number');

		assert.isNull(carryOverEdits(original, diffText(shadow, fixed), changed));
	});
});
