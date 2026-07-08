import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { warnOnLikelyUnquotedGrep } from '../../../src/commands/test/test-command';
import { stripAnsi } from '../../../src/diagnostics/code-frame';

describe('warnOnLikelyUnquotedGrep', () => {
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

	it('warns when --grep is set and a stray non-slug arg is present', () => {
		// `chef test e2e --grep Отключить ящик с отменой` — the shell split the phrase, so
		// "ящик"/"с"/"отменой" arrive as positional args (would fail as unknown extensions).
		warnOnLikelyUnquotedGrep(['ящик', 'с', 'отменой'], { grep: 'Отключить' });

		const text = output();
		assert.include(text, 'ящик');
		assert.include(text, "--grep 'Отключить ящик с отменой'", 'suggests the quoted phrase');
	});

	it('stays silent for legitimate dotted/hyphenated extension names with --grep', () => {
		warnOnLikelyUnquotedGrep(['main.core', 'ui.icon-set.solid', 'ui.bbcode.*'], { grep: 'anything' });

		assert.isEmpty(output(), 'real extension names must not trigger the warning');
	});

	it('stays silent when --grep is not set', () => {
		warnOnLikelyUnquotedGrep(['ящик', 'с'], {});

		assert.isEmpty(output());
	});

	it('stays silent when there are no positional args', () => {
		warnOnLikelyUnquotedGrep([], { grep: 'что-то' });

		assert.isEmpty(output());
	});
});
