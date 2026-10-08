import { describe, it } from 'mocha';
import { assert } from 'chai';

import { TransformationArtifacts } from '../../../../src/modules/engines/lint/oxlint/artifacts';
import { prepareSource } from '../../../../src/modules/engines/lint/oxlint/prepare-source';

import type { ShadowPrepared } from '../../../../src/modules/engines/lint/oxlint/artifacts';

function prepare(text: string, kind: ShadowPrepared['kind']): TransformationArtifacts & { span: (part: string, occurrence?: number) => [number, number] }
{
	const prepared = prepareSource('/a/b.js', text);
	assert.equal(prepared.kind, kind);
	const artifacts = new TransformationArtifacts(text, prepared as ShadowPrepared);

	return Object.assign(artifacts, {
		// the span of a part of the original text
		span(part: string, occurrence = 0): [number, number]
		{
			let start = -1;
			for (let i = 0; i <= occurrence; i++)
			{
				start = text.indexOf(part, start + 1);
			}

			return [start, start + part.length];
		},
	});
}

// `any => void` is Flow only: such a file is linted with its types blanked out
const STRIPPED_IMPORT = "import { computed, type ComputedRef } from 'ui.vue3';\nconst handlers: { stop?: any => void } = {};\n";

describe('TransformationArtifacts', () => {
	it('drops a double space left by a blanked maybe type', () => {
		const artifacts = prepare('export function wrap(value: ?string): ?string\n{\n\treturn value;\n}\n', 'flow-as-ts');

		assert.isTrue(artifacts.has('@stylistic(no-multi-spaces)', ...artifacts.span(': ?')));
	});

	it('drops a trailing comma that a blanked type import leaves behind', () => {
		const artifacts = prepare(STRIPPED_IMPORT, 'stripped');

		assert.isTrue(artifacts.has('@stylistic(comma-dangle)', ...artifacts.span(',')));
	});

	it('drops an unused import the original uses in its types only', () => {
		const text = "import { Type, BaseEvent } from 'main.core';\nconst handlers: { stop?: any => void } = {};\nexport function on(event: BaseEvent): void\n{\n\tconsole.log(event, handlers);\n}\n";
		const artifacts = prepare(text, 'stripped');

		assert.isTrue(artifacts.has('eslint(no-unused-vars)', ...artifacts.span('BaseEvent')));
		assert.isFalse(artifacts.has('eslint(no-unused-vars)', ...artifacts.span('Type')));
	});

	it('keeps a diagnostic over a whole member that contains types', () => {
		const text = 'export class A\n{\n\thandlers: { stop?: any => void } = {};\n\tgetId(): string\n\t{\n\t\treturn \'\';\n\t}\n}\n';
		const artifacts = prepare(text, 'stripped');
		const [start] = artifacts.span('getId');
		const end = text.indexOf('}', start) + 1;

		assert.isFalse(artifacts.has('@stylistic(lines-between-class-members)', start, end));
	});

	it('drops blank lines left by blanked types', () => {
		const text = "import { a } from 'a';\n\nimport {\n\ttype B,\n\ttype C,\n} from 'b';\nconst handlers: { stop?: any => void } = {};\nconsole.log(a, handlers);\n";
		const artifacts = prepare(text, 'stripped');

		// `\ttype B,\n\ttype C,\n` is blanked to whitespace lines
		const start = text.indexOf('\ttype B');
		assert.isTrue(artifacts.has('@stylistic(no-multiple-empty-lines)', start, text.indexOf('} from', start)));
	});

	it('drops formatting inside Flow type annotations, but not line lengths', () => {
		const artifacts = prepare('type Options = {a:?string};\nexport function f(options: Options): ?string\n{\n\treturn options.a;\n}\n', 'flow-as-ts');

		assert.isTrue(artifacts.has('@stylistic(key-spacing)', ...artifacts.span('a:')));
		// transformations keep line lengths
		assert.isFalse(artifacts.has('@stylistic(max-len)', ...artifacts.span('type Options = {a:?string};')));
		assert.isFalse(artifacts.has('@stylistic(semi)', ...artifacts.span('return')));
	});

	it('keeps diagnostics that come from oxlint itself', () => {
		const artifacts = prepare(STRIPPED_IMPORT, 'stripped');

		assert.isFalse(artifacts.has(undefined, ...artifacts.span(',')));
	});
});
