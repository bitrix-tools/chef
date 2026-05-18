import { describe, it } from 'mocha';
import { assert } from 'chai';

import { checkCode } from '../../src/modules/baseline/checker';

const ancient = ['chrome 90', 'firefox 90', 'safari 14'];
const modern = ['chrome 140', 'firefox 140', 'safari 18'];

// The CSS scanner is intentionally line-based (no full CSS AST), so test inputs
// must place each property declaration on its own line — same constraint as the
// legacy regex checker.
function multiline(parts: TemplateStringsArray, ...substitutions: any[]): string
{
	return parts.reduce((acc, str, i) => acc + str + (substitutions[i] ?? ''), '');
}

function check(code: string, targets: string[], id = '/src/styles.css')
{
	return checkCode({ code, id, targets });
}

function expectWarning(code: string, targets: string[], substring: string): void
{
	const w = check(code, targets);
	const found = w.find((x) => x.message.includes(substring));
	assert.isOk(found, `expected warning containing "${substring}", got: ${JSON.stringify(w.map((x) => x.message))}`);
}

function expectNoWarning(code: string, targets: string[]): void
{
	const w = check(code, targets);
	assert.deepEqual(w, [], `expected no warnings, got: ${JSON.stringify(w.map((x) => x.message))}`);
}

describe('baseline / css coverage', () => {
	describe('properties', () => {
		it('warns on container-type on Chrome 100', () => {
			expectWarning(multiline`.x {
				container-type: inline-size;
			}`, ['chrome 100'], 'container-type');
		});

		it('warns on text-wrap on old targets', () => {
			expectWarning(multiline`.x {
				text-wrap: balance;
			}`, ancient, 'text-wrap');
		});

		it('warns on accent-color on Safari 14', () => {
			expectWarning(multiline`input {
				accent-color: red;
			}`, ['safari 14'], 'accent-color');
		});

		it('warns on aspect-ratio on Safari 14', () => {
			expectWarning(multiline`.x {
				aspect-ratio: 16/9;
			}`, ['safari 14'], 'aspect-ratio');
		});

		it('does NOT warn on display:flex (ancient)', () => {
			expectNoWarning(multiline`.x {
				display: flex;
			}`, ancient);
		});

		it('does NOT warn on color:red (ancient)', () => {
			expectNoWarning(multiline`.x {
				color: red;
			}`, ancient);
		});

		it('does NOT warn on vendor-prefix property', () => {
			expectNoWarning(multiline`.x {
				-webkit-text-stroke: 1px black;
			}`, ancient);
		});

		it('is silent on modern targets', () => {
			expectNoWarning(multiline`.x {
				container-type: inline-size;
				text-wrap: balance;
			}`, modern);
		});
	});

	describe('at-rules', () => {
		it('warns on @container on Chrome 100', () => {
			expectWarning(multiline`@container (min-width: 100px) {
				.x { color: red; }
			}`, ['chrome 100'], '@container');
		});

		it('does NOT warn on @media (ancient)', () => {
			expectNoWarning(multiline`@media (min-width: 100px) {
				.x {}
			}`, ancient);
		});
	});

	describe('@supports — progressive enhancement is exempt', () => {
		it('does NOT warn on properties inside @supports', () => {
			const code = multiline`@supports (container-type: inline-size) {
				.x {
					container-type: inline-size;
				}
			}`;
			expectNoWarning(code, ancient);
		});

		it('still warns on properties OUTSIDE @supports', () => {
			const code = multiline`@supports (a: b) {
				.y { color: blue; }
			}
			.x {
				container-type: inline-size;
			}`;
			expectWarning(code, ['chrome 100'], 'container-type');
		});

		it('handles nested @supports', () => {
			const code = multiline`@supports (a: b) {
				@supports (c: d) {
					.x {
						container-type: inline-size;
					}
				}
			}`;
			expectNoWarning(code, ancient);
		});
	});

	describe('selectors', () => {
		it('warns on :has() on Safari 15', () => {
			expectWarning('.parent:has(.child) { color: red; }', ['safari 15'], ':has');
		});

		it('does NOT warn on :hover', () => {
			expectNoWarning('.x:hover { color: red; }', ancient);
		});

		it('skips webkit-prefixed selectors', () => {
			expectNoWarning('.x:-webkit-autofill { color: red; }', ancient);
		});
	});

	describe('@chef-ignore in CSS', () => {
		it('suppresses inline warning', () => {
			const code = multiline`.x {
				container-type: inline-size; /* @chef-ignore */
			}`;
			expectNoWarning(code, ['chrome 100']);
		});

		it('suppresses next-line warning', () => {
			const code = multiline`.x {
				/* @chef-ignore */
				container-type: inline-size;
			}`;
			expectNoWarning(code, ['chrome 100']);
		});
	});

	describe('comment skipping', () => {
		it('skips single-line // comments (in CSS too)', () => {
			expectNoWarning('// container-type: inline-size;', ancient);
		});

		it('skips block /* */ comments', () => {
			expectNoWarning('/* container-type: inline-size; */', ancient);
		});
	});
});
