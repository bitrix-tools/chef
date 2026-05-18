import { describe, it } from 'mocha';
import { assert } from 'chai';

import { collectIgnoredLines } from '../../src/modules/baseline/ignore';

describe('baseline / ignore', () => {
	it('returns an empty set for code without markers', () => {
		const result = collectIgnoredLines('const x = 1;\nconst y = 2;');
		assert.equal(result.size, 0);
	});

	it('detects inline @chef-ignore — suppresses that line', () => {
		const code = 'const x = RegExp.escape("a"); // @chef-ignore';
		const ignored = collectIgnoredLines(code);
		assert.isTrue(ignored.has(1));
	});

	it('detects previous-line @chef-ignore — suppresses the next line', () => {
		const code = [
			'// @chef-ignore',
			'const x = RegExp.escape("a");',
		].join('\n');
		const ignored = collectIgnoredLines(code);
		assert.isTrue(ignored.has(2), 'line 2 (the consumer line) should be ignored');
		assert.isTrue(ignored.has(1), 'comment line is also marked');
	});

	it('multiple markers — accumulates all', () => {
		// Note: legacy behaviour is that any line carrying @chef-ignore
		// also suppresses the line below it, even if the marker is inline.
		// This is kept for backward compatibility with the previous regex checker.
		const code = [
			'const a = RegExp.escape("a"); // @chef-ignore',
			'const b = "ok";',
			'// @chef-ignore',
			'const c = RegExp.escape("c");',
		].join('\n');
		const ignored = collectIgnoredLines(code);
		assert.isTrue(ignored.has(1));
		assert.isTrue(ignored.has(2), 'line after inline marker is also suppressed (legacy parity)');
		assert.isTrue(ignored.has(3));
		assert.isTrue(ignored.has(4));
	});

	it('marker on previous line does NOT propagate two lines down', () => {
		const code = [
			'// @chef-ignore',
			'const a = "fine";',
			'const b = RegExp.escape("b");',
		].join('\n');
		const ignored = collectIgnoredLines(code);
		assert.isFalse(ignored.has(3), 'third line should not be suppressed');
	});

	it('handles CRLF line endings', () => {
		const code = 'const a = 1;\r\n// @chef-ignore\r\nconst b = RegExp.escape("b");';
		const ignored = collectIgnoredLines(code);
		assert.isTrue(ignored.has(2));
		assert.isTrue(ignored.has(3));
	});

	it('empty input', () => {
		const ignored = collectIgnoredLines('');
		assert.equal(ignored.size, 0);
	});

	it('only a marker — no following line to suppress', () => {
		const ignored = collectIgnoredLines('// @chef-ignore');
		assert.isTrue(ignored.has(1));
		assert.isFalse(ignored.has(2));
	});
});
