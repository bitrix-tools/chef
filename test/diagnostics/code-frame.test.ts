import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import {
	stripAnsi,
	hasLocalFilePath,
	hasCodeFrame,
	hasCodeFramePatterns,
	isCodeFrameLine,
	styleErrorMessage,
	renderCodeFrame,
	formatStack,
} from '../../src/diagnostics/code-frame';

describe('stripAnsi', () => {
	it('should remove ANSI color codes', () => {
		assert.equal(stripAnsi('\x1B[31mred\x1B[0m'), 'red');
	});

	it('should return plain text unchanged', () => {
		assert.equal(stripAnsi('hello world'), 'hello world');
	});

	it('should handle multiple codes', () => {
		assert.equal(stripAnsi('\x1B[1m\x1B[32mgreen bold\x1B[0m'), 'green bold');
	});

	it('should handle empty string', () => {
		assert.equal(stripAnsi(''), '');
	});
});

describe('hasLocalFilePath', () => {
	it('should return true for local file path', () => {
		assert.isTrue(hasLocalFilePath('at /src/app.ts:10:5'));
	});

	it('should return false for CDN path', () => {
		assert.isFalse(hasLocalFilePath('at //cdn.jsdelivr.net/foo.js:1:1'));
	});

	it('should return false for undefined', () => {
		assert.isFalse(hasLocalFilePath(undefined));
	});

	it('should return false for empty string', () => {
		assert.isFalse(hasLocalFilePath(''));
	});

	it('should return false for stack without file paths', () => {
		assert.isFalse(hasLocalFilePath('Error: something went wrong'));
	});
});

describe('hasCodeFrame', () => {
	it('should return true when frame is set', () => {
		assert.isTrue(hasCodeFrame({ frame: '> 1 | code' }));
	});

	it('should return true when loc is set', () => {
		assert.isTrue(hasCodeFrame({ loc: { file: 'a.ts', line: 1, column: 1 } }));
	});

	it('should return true when stack has local path', () => {
		assert.isTrue(hasCodeFrame({ stack: 'Error\n  at /src/app.ts:10:5' }));
	});

	it('should return false when no frame info', () => {
		assert.isFalse(hasCodeFrame({}));
	});

	it('should return false when stack has no local path', () => {
		assert.isFalse(hasCodeFrame({ stack: 'Error: something' }));
	});
});

describe('hasCodeFramePatterns', () => {
	it('should detect pipe format with pointer', () => {
		assert.isTrue(hasCodeFramePatterns('> 5 | const x = 1;'));
	});

	it('should detect pipe format without pointer', () => {
		assert.isTrue(hasCodeFramePatterns('  5 | const x = 1;'));
	});

	it('should detect Rollup format', () => {
		assert.isTrue(hasCodeFramePatterns('5: const x = 1;'));
	});

	it('should return false for plain text', () => {
		assert.isFalse(hasCodeFramePatterns('Something went wrong'));
	});
});

describe('isCodeFrameLine', () => {
	it('should detect error line (pipe format)', () => {
		assert.isTrue(isCodeFrameLine('> 5 | const x = 1;'));
	});

	it('should detect context line (pipe format)', () => {
		assert.isTrue(isCodeFrameLine('  5 | const x = 1;'));
	});

	it('should detect pointer line (pipe format)', () => {
		assert.isTrue(isCodeFrameLine('    | ^'));
	});

	it('should detect context line (Rollup format)', () => {
		assert.isTrue(isCodeFrameLine('5: const x = 1;'));
	});

	it('should detect pointer line (Rollup format)', () => {
		assert.isTrue(isCodeFrameLine('   ^^^'));
	});

	it('should detect "at /path:line:col"', () => {
		assert.isTrue(isCodeFrameLine('at /src/app.ts:10:5'));
	});

	it('should return false for plain text', () => {
		assert.isFalse(isCodeFrameLine('Something went wrong'));
	});

	it('should return false for empty string', () => {
		assert.isFalse(isCodeFrameLine(''));
	});
});

describe('styleErrorMessage', () => {
	it('should highlight error line in pipe format', () => {
		const result = styleErrorMessage('> 5 | const x = 1;');
		const plain = stripAnsi(result[0]);

		assert.include(plain, '5');
		assert.include(plain, 'const x = 1;');
	});

	it('should dim context lines in pipe format', () => {
		const result = styleErrorMessage('  3 | const a = 1;');

		assert.lengthOf(result, 1);
		// Context code should be dimmed (contains ANSI dim code)
		assert.include(result[0], '\x1B[2m');
	});

	it('should color pointer line red', () => {
		const result = styleErrorMessage('    | ^');

		assert.lengthOf(result, 1);
		assert.include(result[0], '\x1B[31m'); // red
	});

	it('should color Expected green', () => {
		const result = styleErrorMessage('Expected: true');

		assert.include(result[0], '\x1B[32m'); // green
	});

	it('should color Received red', () => {
		const result = styleErrorMessage('Received: false');

		assert.include(result[0], '\x1B[31m'); // red
	});

	it('should dim other lines', () => {
		const result = styleErrorMessage('Something else');

		assert.include(result[0], '\x1B[2m'); // dim
	});
});

describe('renderCodeFrame', () => {
	let tmpDir: string;
	let tmpFile: string;

	beforeEach(async () => {
		tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'chef-codeframe-'));
		tmpFile = path.join(tmpDir, 'test.ts');
	});

	afterEach(async () => {
		await fsp.rm(tmpDir, { recursive: true });
	});

	it('should render code frame with error line highlighted', () => {
		fs.writeFileSync(tmpFile, 'const a = 1;\nconst b = {;\nconst c = 3;\n');

		const result = renderCodeFrame(tmpFile, 2, 11);
		const plain = result.map(stripAnsi);

		// Should have the error line with ">"
		const errorLine = plain.find((l) => l.startsWith('>'));
		assert.isDefined(errorLine);
		assert.include(errorLine!, 'const b = {;');

		// Should have a pointer line with "^"
		const pointerLine = plain.find((l) => l.includes('^'));
		assert.isDefined(pointerLine);
	});

	it('should show context lines around the error', () => {
		const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
		fs.writeFileSync(tmpFile, lines.join('\n'));

		const result = renderCodeFrame(tmpFile, 5, 1);
		const plain = result.map(stripAnsi);

		// Context: 2 lines before, error line, 2 lines after
		// Line 3, 4, 5 (error), 6, 7 — plus pointer = 6 lines
		assert.isAtLeast(plain.length, 5);
	});

	it('should return empty array for non-existent file', () => {
		const result = renderCodeFrame('/no/such/file.ts', 1, 1);

		assert.deepEqual(result, []);
	});

	it('should expand tabs to 4 spaces', () => {
		fs.writeFileSync(tmpFile, 'const a = 1;\n\tconst b = 2;\nconst c = 3;\n');

		const result = renderCodeFrame(tmpFile, 2, 2);
		const plain = result.map(stripAnsi);

		const errorLine = plain.find((l) => l.startsWith('>'));
		assert.isDefined(errorLine);
		// Tab should be expanded to 4 spaces (but common indent is stripped)
		assert.include(errorLine!, '    const b = 2;');
	});

	it('should strip common indentation', () => {
		fs.writeFileSync(tmpFile, '    const a = 1;\n    const b = 2;\n    const c = 3;\n');

		const result = renderCodeFrame(tmpFile, 2, 5);
		const plain = result.map(stripAnsi);

		// The 4-space indent should be stripped
		const errorLine = plain.find((l) => l.startsWith('>'));
		assert.isDefined(errorLine);
		assert.include(errorLine!, 'const b = 2;');
	});

	it('should align pointer with the correct column', () => {
		fs.writeFileSync(tmpFile, 'const a = 1;\nconst b = {;\nconst c = 3;\n');

		const result = renderCodeFrame(tmpFile, 2, 11);
		const plain = result.map(stripAnsi);

		const errorLine = plain.find((l) => l.startsWith('>'));
		const pointerLine = plain.find((l) => l.includes('^'));

		assert.isDefined(errorLine);
		assert.isDefined(pointerLine);

		// "^" should point at "{" (column 11)
		const caretPos = pointerLine!.indexOf('^');
		const bracePos = errorLine!.indexOf('{');
		assert.equal(caretPos, bracePos, 'pointer should align with error column');
	});

	it('should align pointer correctly with stripped common indent', () => {
		// All lines indented by 8 spaces, "{" is at column 19 (1-based) in the original
		fs.writeFileSync(tmpFile, '        const a = 1;\n        const b = {;\n        const c = 3;\n');

		const result = renderCodeFrame(tmpFile, 2, 19);
		const plain = result.map(stripAnsi);

		const errorLine = plain.find((l) => l.startsWith('>'));
		const pointerLine = plain.find((l) => l.includes('^'));

		assert.isDefined(errorLine);
		assert.isDefined(pointerLine);

		// After stripping 8-space common indent, pointer should still align with "{"
		const caretPos = pointerLine!.indexOf('^');
		const bracePos = errorLine!.indexOf('{');
		assert.equal(caretPos, bracePos, 'pointer should align after indent stripping');
	});

	it('should handle line numbers of different widths', () => {
		// Create file with 100+ lines to test padding
		const lines = Array.from({ length: 105 }, (_, i) => `line ${i + 1};`);
		fs.writeFileSync(tmpFile, lines.join('\n'));

		const result = renderCodeFrame(tmpFile, 100, 1);
		const plain = result.map(stripAnsi);

		// All lines should have consistent alignment
		const pipePosSet = new Set<number>();
		for (const line of plain)
		{
			const pipePos = line.indexOf('|');
			if (pipePos >= 0)
			{
				pipePosSet.add(pipePos);
			}
		}

		// All pipe "|" symbols should be at the same column
		assert.equal(pipePosSet.size, 1, 'all pipes should align at the same column');
	});

	it('should dim context lines code', () => {
		fs.writeFileSync(tmpFile, 'const a = 1;\nconst b = 2;\nconst c = 3;\n');

		const result = renderCodeFrame(tmpFile, 2, 1);

		// Context lines should contain dim ANSI code
		const contextLines = result.filter((l) => !stripAnsi(l).startsWith('>') && !stripAnsi(l).includes('^'));
		for (const line of contextLines)
		{
			if (line.trim())
			{
				assert.include(line, '\x1B[2m', 'context line should be dimmed');
			}
		}
	});
});

describe('formatStack', () => {
	let tmpDir: string;
	let tmpFile: string;

	beforeEach(async () => {
		tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'chef-stack-'));
		tmpFile = path.join(tmpDir, 'error.ts');
	});

	afterEach(async () => {
		await fsp.rm(tmpDir, { recursive: true });
	});

	it('should render code frame from stack trace', () => {
		fs.writeFileSync(tmpFile, 'const a = 1;\nthrow new Error();\nconst c = 3;\n');

		const result = formatStack(`Error: something\n  at ${tmpFile}:2:7`);
		const plain = result.map(stripAnsi);

		// Should have code frame + "at" line
		assert.isAbove(plain.length, 0);
		const atLine = plain.find((l) => l.includes('at '));
		assert.isDefined(atLine);
		assert.include(atLine!, tmpFile);
	});

	it('should return empty array when no file paths in stack', () => {
		const result = formatStack('Error: something went wrong');

		assert.deepEqual(result, []);
	});

	it('should skip CDN paths', () => {
		const result = formatStack('Error\n  at //cdn.example.com/lib.js:1:1');

		assert.deepEqual(result, []);
	});
});
