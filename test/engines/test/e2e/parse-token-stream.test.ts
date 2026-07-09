import { describe, it } from 'mocha';
import { assert } from 'chai';

import { parseTokenStream } from '../../../../src/modules/engines/test/e2e/parse-token-stream';

function wrap(data: Record<string, unknown>): string
{
	return `__CHEF_TOKEN__${JSON.stringify(data)}__CHEF_TOKEN__`;
}

describe('parseTokenStream', () => {
	it('should return empty events for empty buffer', () => {
		const { events, remaining } = parseTokenStream('');

		assert.deepEqual(events, []);
		assert.equal(remaining, '');
	});

	it('should parse a TEST_PASSED token', () => {
		const buffer = wrap({ id: 'TEST_PASSED', title: 'should work', suite: ['App'], duration: 5 });
		const { events, remaining } = parseTokenStream(buffer);

		assert.equal(events.length, 1);
		assert.equal(events[0].type, 'token');
		if (events[0].type === 'token')
		{
			assert.equal(events[0].token.id, 'TEST_PASSED');
			assert.equal(events[0].token.title, 'should work');
			assert.deepEqual(events[0].token.suite, ['App']);
			assert.equal(events[0].token.duration, 5);
		}
		assert.equal(remaining, '');
	});

	it('should parse a TEST_FAILED token with error', () => {
		const buffer = wrap({
			id: 'TEST_FAILED',
			title: 'fails',
			suite: ['Suite'],
			duration: 10,
			error: { message: 'expected true', stack: 'at file.ts:5:3' },
		});
		const { events } = parseTokenStream(buffer);

		assert.equal(events.length, 1);
		if (events[0].type === 'token')
		{
			assert.equal(events[0].token.id, 'TEST_FAILED');
			assert.equal(events[0].token.error?.message, 'expected true');
		}
	});

	it('should carry per-test attachments on a token', () => {
		const buffer = wrap({
			id: 'TEST_FAILED',
			title: 'fails',
			suite: ['Suite'],
			attachments: [
				{ name: 'screenshot', contentType: 'image/png', path: '/tmp/x/test-failed-1.png' },
				{ name: 'trace', contentType: 'application/zip', path: '/tmp/x/trace.zip' },
			],
		});
		const { events } = parseTokenStream(buffer);

		assert.equal(events.length, 1);
		assert.equal(events[0].type, 'token');
		if (events[0].type === 'token')
		{
			assert.lengthOf(events[0].token.attachments ?? [], 2);
			assert.equal(events[0].token.attachments?.[0].name, 'screenshot');
			assert.equal(events[0].token.attachments?.[0].path, '/tmp/x/test-failed-1.png');
		}
	});

	it('should parse BEGIN event', () => {
		const buffer = wrap({ id: 'BEGIN', totalTests: 42, browserCount: 3 });
		const { events } = parseTokenStream(buffer);

		assert.equal(events.length, 1);
		assert.deepEqual(events[0], { type: 'begin', totalTests: 42, browserCount: 3 });
	});

	it('should parse STATUS event', () => {
		const buffer = wrap({ id: 'STATUS', text: 'Running tests...' });
		const { events } = parseTokenStream(buffer);

		assert.equal(events.length, 1);
		assert.deepEqual(events[0], { type: 'status', text: 'Running tests...' });
	});

	it('should parse END event', () => {
		const buffer = wrap({ id: 'END', status: 'passed', duration: 1000 });
		const { events } = parseTokenStream(buffer);

		assert.equal(events.length, 1);
		assert.deepEqual(events[0], { type: 'end' });
	});

	it('should parse a RUN_ERROR event', () => {
		const buffer = wrap({ id: 'RUN_ERROR', error: { message: 'Cannot find module', stack: 'at spec.ts:1' } });
		const { events } = parseTokenStream(buffer);

		assert.equal(events.length, 1);
		assert.deepEqual(events[0], { type: 'runError', message: 'Cannot find module', stack: 'at spec.ts:1' });
	});

	it('should parse a STDIO event and decode its base64 text (incl. newlines and cyrillic)', () => {
		const text = 'DEBUG: значение = 42\nвторая строка';
		const buffer = wrap({ id: 'STDIO', textBase64: Buffer.from(text, 'utf-8').toString('base64') });
		const { events } = parseTokenStream(buffer);

		assert.equal(events.length, 1);
		assert.deepEqual(events[0], { type: 'stdio', text });
	});

	it('should extract browser from token data', () => {
		const buffer = wrap({ id: 'TEST_PASSED', title: 'test', browser: 'Chromium' });
		const { events } = parseTokenStream(buffer);

		if (events[0].type === 'token')
		{
			assert.equal(events[0].browser, 'Chromium');
		}
	});

	it('should parse multiple tokens in one chunk', () => {
		const buffer = wrap({ id: 'TEST_PASSED', title: 'a' })
			+ wrap({ id: 'TEST_FAILED', title: 'b', error: { message: 'fail' } })
			+ wrap({ id: 'TEST_PENDING', title: 'c' });

		const { events } = parseTokenStream(buffer);

		assert.equal(events.length, 3);
		assert.equal(events[0].type, 'token');
		assert.equal(events[1].type, 'token');
		assert.equal(events[2].type, 'token');
	});

	it('should handle incomplete token at end of buffer', () => {
		const complete = wrap({ id: 'TEST_PASSED', title: 'done' });
		const incomplete = '__CHEF_TOKEN__{"id":"TEST_PASSED","title":"pending"';

		const { events, remaining } = parseTokenStream(complete + incomplete);

		assert.equal(events.length, 1);
		assert.equal(remaining, incomplete);
	});

	it('should handle noise before and between tokens', () => {
		const noise = 'some random output\n';
		const token = wrap({ id: 'TEST_PASSED', title: 'test' });

		const { events, remaining } = parseTokenStream(noise + token + noise);

		assert.equal(events.length, 1);
		assert.equal(remaining, noise);
	});

	it('should skip malformed JSON', () => {
		const malformed = '__CHEF_TOKEN__{invalid json}__CHEF_TOKEN__';
		const valid = wrap({ id: 'TEST_PASSED', title: 'ok' });

		const { events } = parseTokenStream(malformed + valid);

		assert.equal(events.length, 1);
		if (events[0].type === 'token')
		{
			assert.equal(events[0].token.title, 'ok');
		}
	});

	it('should set browser to undefined when not present', () => {
		const buffer = wrap({ id: 'TEST_PASSED', title: 'test' });
		const { events } = parseTokenStream(buffer);

		if (events[0].type === 'token')
		{
			assert.isUndefined(events[0].browser);
		}
	});
});
