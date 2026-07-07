import { describe, it } from 'mocha';
import { assert } from 'chai';

import {
	parseConsoleTarget,
	isValidConsoleValue,
	showsBrowserConsole,
	showsNodeOutput,
} from '../../../src/commands/test/console-target';

describe('console-target', () => {
	describe('parseConsoleTarget', () => {
		it('treats a bare --console (true) as browser', () => {
			assert.equal(parseConsoleTarget(true), 'browser');
		});

		it('returns null when the flag is absent', () => {
			assert.isNull(parseConsoleTarget(undefined));
			assert.isNull(parseConsoleTarget(false));
		});

		it('accepts the known targets', () => {
			assert.equal(parseConsoleTarget('browser'), 'browser');
			assert.equal(parseConsoleTarget('node'), 'node');
			assert.equal(parseConsoleTarget('all'), 'all');
		});

		it('returns null for an unknown target', () => {
			assert.isNull(parseConsoleTarget('conole'));
			assert.isNull(parseConsoleTarget('stdout'));
		});
	});

	describe('isValidConsoleValue', () => {
		it('accepts absent, bare, and known values', () => {
			assert.isTrue(isValidConsoleValue(undefined));
			assert.isTrue(isValidConsoleValue(true));
			assert.isTrue(isValidConsoleValue('browser'));
			assert.isTrue(isValidConsoleValue('all'));
		});

		it('rejects an unknown value', () => {
			assert.isFalse(isValidConsoleValue('nope'));
		});
	});

	describe('showsBrowserConsole / showsNodeOutput', () => {
		it('bare --console shows only the browser console', () => {
			assert.isTrue(showsBrowserConsole(true));
			assert.isFalse(showsNodeOutput(true));
		});

		it('node shows only the node output', () => {
			assert.isFalse(showsBrowserConsole('node'));
			assert.isTrue(showsNodeOutput('node'));
		});

		it('all shows both', () => {
			assert.isTrue(showsBrowserConsole('all'));
			assert.isTrue(showsNodeOutput('all'));
		});

		it('absent flag shows neither', () => {
			assert.isFalse(showsBrowserConsole(undefined));
			assert.isFalse(showsNodeOutput(undefined));
		});
	});
});
