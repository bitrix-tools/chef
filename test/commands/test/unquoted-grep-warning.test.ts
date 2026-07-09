import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { reportUnquotedGrep } from '../../../src/commands/test/test-command';
import { stripAnsi } from '../../../src/diagnostics/code-frame';

describe('reportUnquotedGrep', () => {
	let logs: string[];
	let originalLog: typeof console.log;

	beforeEach(() => {
		logs = [];
		originalLog = console.log;
		console.log = ((...parts: unknown[]) => { logs.push(parts.join(' ')); }) as any;
	});

	afterEach(() => {
		console.log = originalLog;
	});

	function output(): string
	{
		return stripAnsi(logs.join('\n'));
	}

	it('reports and returns true when --grep is set and a stray non-slug arg is present', () => {
		// `chef test e2e --grep Отключить ящик с отменой` — the shell split the phrase, so
		// "ящик"/"с"/"отменой" arrive as positional args (would fail as unknown extensions).
		const detected = reportUnquotedGrep(['ящик', 'с', 'отменой'], { grep: 'Отключить' });

		assert.isTrue(detected, 'a lost-quotes phrase must be detected (caller aborts)');
		const text = output();
		assert.include(text, 'ящик');
		assert.include(text, "--grep 'Отключить ящик с отменой'", 'suggests the quoted phrase');
	});

	it('returns false and stays silent for legitimate extension names with --grep', () => {
		const detected = reportUnquotedGrep(['main.core', 'ui.icon-set.solid', 'ui.bbcode.*'], { grep: 'anything' });

		assert.isFalse(detected);
		assert.isEmpty(output(), 'real extension names must not trigger the warning');
	});

	it('returns false when --grep is not set', () => {
		const detected = reportUnquotedGrep(['ящик', 'с'], {});

		assert.isFalse(detected);
		assert.isEmpty(output());
	});

	it('returns false when there are no positional args', () => {
		const detected = reportUnquotedGrep([], { grep: 'что-то' });

		assert.isFalse(detected);
		assert.isEmpty(output());
	});
});
