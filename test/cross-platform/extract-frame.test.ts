import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { extractFrameFromStack } from '../../src/reporters/json/extract-frame';

// extract-frame parses stack traces for the JSON reporter. The current regex
// requires the path to begin with "/", so on Windows paths like
// "C:\\Users\\me\\foo.ts" never match — the JSON report silently loses
// file/line/column for failures. These tests cover the native separator using
// a real temporary file so that a successful regex match yields a non-null
// result we can assert on.

describe('extractFrameFromStack', () => {
	let tmpDir: string;
	let tmpFile: string;

	beforeEach(() => {
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-extract-frame-')));
		tmpFile = path.join(tmpDir, 'foo.ts');
		fs.writeFileSync(tmpFile, 'line one\nline two\nline three\nline four\nline five\n');
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('parses a stack frame with the native separator', () => {
		// On POSIX hosts tmpFile is "/tmp/.../foo.ts"; on Windows it is
		// "C:\\Users\\…\\foo.ts". The function must handle both.
		const stack = [
			'Error: boom',
			`    at fn (${tmpFile}:3:1)`,
		].join('\n');

		const result = extractFrameFromStack(stack);
		assert.isNotNull(result, `stack frame for "${tmpFile}" must be parsed on ${process.platform}`);
		assert.equal(result!.file, tmpFile);
		assert.equal(result!.line, 3);
		assert.equal(result!.column, 1);
	});

	it('returns null when the stack contains no parseable frame', () => {
		const stack = 'Error: boom\n    at <anonymous>';
		const result = extractFrameFromStack(stack);
		assert.isNull(result);
	});

	it('returns null when the file does not exist', () => {
		const stack = `Error: boom\n    at fn (${tmpDir}/missing.ts:1:1)`;
		const result = extractFrameFromStack(stack);
		assert.isNull(result);
	});

	it('skips frames with file:// or other URL schemes', () => {
		const stack = [
			'Error: boom',
			'    at fn (file:///foo.ts:1:1)',
			'    at gg (http://example.com/bar.js:2:2)',
		].join('\n');

		const result = extractFrameFromStack(stack);
		assert.isNull(result);
	});
});
