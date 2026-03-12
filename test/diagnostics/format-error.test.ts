import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { formatError, formatInternalError } from '../../src/diagnostics/format-error';
import { stripAnsi } from '../../src/diagnostics/code-frame';

describe('formatError', () => {
	describe('simple messages', () => {
		it('should format plain error message', () => {
			const result = formatError({ message: 'Something went wrong' });
			const plain = result.map(stripAnsi);

			assert.lengthOf(result, 1);
			assert.include(plain[0], 'Something went wrong');
		});

		it('should prepend error code in red', () => {
			const result = formatError({ code: 'CF1001', message: 'Type error' });
			const plain = result.map(stripAnsi);

			assert.include(plain[0], '[CF1001]');
			assert.include(plain[0], 'Type error');
			// Red color for error
			assert.include(result[0], '\x1B[31m');
		});

		it('should prepend warning code in yellow', () => {
			const result = formatError({ code: 'CF1006', severity: 'warning', message: 'Circular dep' });
			const plain = result.map(stripAnsi);

			assert.include(plain[0], '[CF1006]');
			assert.include(plain[0], 'Circular dep');
			// Yellow color for warning
			assert.include(result[0], '\x1B[33m');
		});

		it('should work without code', () => {
			const result = formatError({ message: 'No code here' });
			const plain = result.map(stripAnsi);

			assert.notInclude(plain[0], '[');
			assert.include(plain[0], 'No code here');
		});
	});

	describe('with indent', () => {
		it('should indent all non-empty lines', () => {
			const result = formatError({ message: 'Error text' }, '    ');
			const plain = result.map(stripAnsi);

			for (const line of plain)
			{
				if (line.trim())
				{
					assert.isTrue(line.startsWith('    '), `line should be indented: "${line}"`);
				}
			}
		});

		it('should not indent empty lines', () => {
			const result = formatError({
				message: 'Error',
				frame: '> 1 | code\n    | ^',
			}, '    ');

			const emptyLines = result.filter((l) => stripAnsi(l) === '');
			for (const line of emptyLines)
			{
				assert.equal(line, '');
			}
		});

		it('should preserve pointer alignment with indent', () => {
			const result = formatError({
				message: 'Error',
				frame: '> 1 | const x = {;\n    |           ^',
			}, '     ');
			const plain = result.map(stripAnsi);

			const errorLine = plain.find((l) => l.includes('const x'));
			const pointerLine = plain.find((l) => l.includes('^'));

			assert.isDefined(errorLine);
			assert.isDefined(pointerLine);

			// Both should have the same indent prefix
			const errorIndent = errorLine!.match(/^(\s*)/)?.[1].length ?? 0;
			const pointerIndent = pointerLine!.match(/^(\s*)/)?.[1].length ?? 0;

			// Pointer indent should be >= error indent (pointer is offset to the right)
			assert.isAtLeast(pointerIndent, errorIndent);
		});

		it('should indent code frame lines from loc', async () => {
			const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'chef-indent-'));
			const tmpFile = path.join(tmpDir, 'test.ts');
			fs.writeFileSync(tmpFile, 'const a = 1;\nconst b = {;\nconst c = 3;\n');

			try
			{
				const result = formatError({
					message: 'Syntax error',
					loc: { file: tmpFile, line: 2, column: 11 },
				}, '     ');
				const plain = result.map(stripAnsi);

				// All non-empty lines should start with 5-space indent
				for (const line of plain)
				{
					if (line.trim())
					{
						assert.isTrue(line.startsWith('     '), `expected indent: "${line}"`);
					}
				}

				// Pointer "^" should align with column 11 of error line
				const errorLine = plain.find((l) => l.includes('>') && l.includes('const b'));
				const pointerLine = plain.find((l) => l.includes('^'));
				assert.isDefined(errorLine);
				assert.isDefined(pointerLine);

				// "^" position should point at "{" in "const b = {;"
				const caretPos = pointerLine!.indexOf('^');
				const bracePos = errorLine!.indexOf('{');
				assert.isAbove(caretPos, 0);
				assert.isAbove(bracePos, 0);
				assert.equal(caretPos, bracePos, 'pointer should align with the error column');
			}
			finally
			{
				await fsp.rm(tmpDir, { recursive: true });
			}
		});

		it('should indent multiline message consistently', () => {
			const result = formatError({
				message: 'Line one\nLine two\nLine three',
			}, '   ');
			const plain = result.map(stripAnsi);

			for (const line of plain)
			{
				if (line.trim())
				{
					assert.isTrue(line.startsWith('   '), `expected indent: "${line}"`);
				}
			}
		});
	});

	describe('with loc (code frame from source)', () => {
		let tmpDir: string;
		let tmpFile: string;

		beforeEach(async () => {
			tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'chef-format-'));
			tmpFile = path.join(tmpDir, 'source.ts');
			fs.writeFileSync(tmpFile, 'const a = 1;\nconst b = {;\nconst c = 3;\n');
		});

		afterEach(async () => {
			await fsp.rm(tmpDir, { recursive: true });
		});

		it('should render code frame from loc', () => {
			const result = formatError({
				message: 'Unexpected token',
				loc: { file: tmpFile, line: 2, column: 11 },
			});
			const plain = result.map(stripAnsi);

			// Should have error message
			assert.isTrue(plain.some((l) => l.includes('Unexpected token')));

			// Should have code frame with error line
			assert.isTrue(plain.some((l) => l.includes('const b = {;')));

			// Should have "at" line
			assert.isTrue(plain.some((l) => l.includes(`at ${tmpFile}:2:11`)));
		});

		it('should strip embedded code frame from message when loc is provided', () => {
			const result = formatError({
				message: 'Error (2:11)\n> 2 | const b = {;\n    |           ^',
				loc: { file: tmpFile, line: 2, column: 11 },
			});
			const plain = result.map(stripAnsi);

			// Message should not contain the embedded code frame lines
			const messageLines = plain.filter((l) => l.includes('const b'));
			// The embedded frame line from the message should be stripped;
			// only our rendered code frame should contain it
			assert.isAtMost(messageLines.length, 1);
		});
	});

	describe('with frame (pre-rendered code frame)', () => {
		it('should style and include the frame', () => {
			const result = formatError({
				message: 'Syntax error',
				frame: '> 1 | const x = {;\n    | ^',
			});
			const plain = result.map(stripAnsi);

			assert.isTrue(plain.some((l) => l.includes('Syntax error')));
			assert.isTrue(plain.some((l) => l.includes('const x = {;')));
		});
	});

	describe('with stack trace', () => {
		let tmpDir: string;
		let tmpFile: string;

		beforeEach(async () => {
			tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'chef-stack-'));
			tmpFile = path.join(tmpDir, 'error.ts');
			fs.writeFileSync(tmpFile, 'line 1\nline 2\nline 3\n');
		});

		afterEach(async () => {
			await fsp.rm(tmpDir, { recursive: true });
		});

		it('should render code frame from stack with local file path', () => {
			const result = formatError({
				message: 'Runtime error',
				stack: `Error: Runtime error\n  at ${tmpFile}:2:1`,
			});
			const plain = result.map(stripAnsi);

			assert.isTrue(plain.some((l) => l.includes('at ')));
		});

		it('should not render code frame when stack has no local paths', () => {
			const result = formatError({
				message: 'CDN error',
				stack: 'Error\n  at //cdn.example.com/lib.js:1:1',
			});
			const plain = result.map(stripAnsi);

			assert.lengthOf(plain, 1);
			assert.include(plain[0], 'CDN error');
		});
	});

	describe('with diff', () => {
		it('should render diff when showDiff is true', () => {
			const result = formatError({
				message: 'Assertion failed',
				showDiff: true,
				actual: 'hello',
				expected: 'world',
			});
			const plain = result.map(stripAnsi);

			assert.isTrue(plain.some((l) => l.includes('Expected')));
			assert.isTrue(plain.some((l) => l.includes('Received')));
		});

		it('should not render diff when showDiff is false', () => {
			const result = formatError({
				message: 'Error',
				showDiff: false,
				actual: 'hello',
				expected: 'world',
			});
			const plain = result.map(stripAnsi);

			assert.isFalse(plain.some((l) => l.includes('Expected')));
		});

		it('should not render diff when actual/expected are undefined', () => {
			const result = formatError({
				message: 'Error',
				showDiff: true,
			});
			const plain = result.map(stripAnsi);

			assert.isFalse(plain.some((l) => l.includes('Expected')));
		});
	});

	describe('embedded code frames in message', () => {
		it('should style inline code frame when no loc/frame/stack', () => {
			const message = '> 1 | const x = {;\n    | ^\n  2 | const y = 1;';
			const result = formatError({ message });

			// Should have styled output (ANSI codes present)
			assert.isTrue(result.some((l) => l.includes('\x1B[')));
		});

		it('should prepend code to styled code frame', () => {
			const message = '> 1 | const x = {;\n    | ^';
			const result = formatError({ code: 'CF1002', message });
			const plain = result.map(stripAnsi);

			assert.isTrue(plain.some((l) => l.includes('[CF1002]')));
		});
	});
});

describe('formatInternalError', () => {
	it('should wrap in boxen with Internal Error title', () => {
		const result = formatInternalError({
			message: 'Something broke',
		});
		const plain = stripAnsi(result);

		assert.include(plain, 'Internal Error');
		assert.include(plain, 'Something broke');
	});

	it('should use provided code', () => {
		const result = formatInternalError({
			code: 'CF9001',
			message: 'Package read error',
		});
		const plain = stripAnsi(result);

		assert.include(plain, 'CF9001');
		assert.include(plain, 'Package read error');
	});

	it('should default to CF9002 when no code', () => {
		const result = formatInternalError({
			message: 'Unknown error',
		});
		const plain = stripAnsi(result);

		assert.include(plain, 'CF9002');
	});

	it('should include stack trace when provided', () => {
		const result = formatInternalError({
			message: 'Error',
			stack: 'Error: something\n  at file.ts:1:1',
		});
		const plain = stripAnsi(result);

		assert.include(plain, 'Stack trace:');
		assert.include(plain, 'at file.ts:1:1');
	});

	it('should include chef version', () => {
		const result = formatInternalError({
			message: 'Error',
		});
		const plain = stripAnsi(result);

		assert.include(plain, 'chef');
	});

	it('should include node version', () => {
		const result = formatInternalError({
			message: 'Error',
		});
		const plain = stripAnsi(result);

		assert.include(plain, process.version);
	});

	it('should include platform info', () => {
		const result = formatInternalError({
			message: 'Error',
		});
		const plain = stripAnsi(result);

		assert.include(plain, process.platform);
		assert.include(plain, process.arch);
	});

	it('should include issue reporting link', () => {
		const result = formatInternalError({
			message: 'Error',
		});
		const plain = stripAnsi(result);

		assert.include(plain, 'https://github.com/bitrix-tools/chef/issues');
	});
});
