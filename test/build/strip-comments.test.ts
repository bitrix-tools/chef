import { describe, it } from 'mocha';
import { assert } from 'chai';

import { stripComments } from '../../src/modules/engines/build/rollup/plugins/strip-comments';

describe('stripComments', () => {
	it('should remove single-line comments on their own line', () => {
		const input = 'const a = 1;\n// comment\nconst b = 2;';
		const result = stripComments(input);

		assert.equal(result, 'const a = 1;\nconst b = 2;');
	});

	it('should remove inline comments without leaving trailing whitespace', () => {
		const input = 'const a = 1; // inline comment\nconst b = 2;';
		const result = stripComments(input);

		assert.equal(result, 'const a = 1;\nconst b = 2;');
	});

	it('should remove multi-line comments on their own line', () => {
		const input = 'const a = 1;\n/* block comment */\nconst b = 2;';
		const result = stripComments(input);

		assert.equal(result, 'const a = 1;\nconst b = 2;');
	});

	it('should remove multi-line JSDoc comments', () => {
		const input = 'const a = 1;\n/**\n * JSDoc\n * @param x\n */\nconst b = 2;';
		const result = stripComments(input);

		assert.equal(result, 'const a = 1;\nconst b = 2;');
	});

	it('should remove indented comments without leaving blank lines', () => {
		const input = '\tconst a = 1;\n\t// indented comment\n\tconst b = 2;';
		const result = stripComments(input);

		assert.equal(result, '\tconst a = 1;\n\tconst b = 2;');
	});

	it('should not leave consecutive blank lines after removing multiple comments', () => {
		const input = 'const a = 1;\n// comment 1\n// comment 2\n// comment 3\nconst b = 2;';
		const result = stripComments(input);

		assert.equal(result, 'const a = 1;\nconst b = 2;');
	});

	it('should preserve strings containing comment-like content', () => {
		const input = 'const url = "http://example.com";';
		const result = stripComments(input);

		assert.equal(result, 'const url = "http://example.com";');
	});

	it('should preserve template literals with comment-like content', () => {
		const input = 'const s = `// not a comment`;';
		const result = stripComments(input);

		assert.equal(result, 'const s = `// not a comment`;');
	});

	it('should preserve regex literals', () => {
		const input = 'const re = /test/gi;';
		const result = stripComments(input);

		assert.equal(result, 'const re = /test/gi;');
	});

	it('should keep inline block comment text removed but code intact', () => {
		const input = 'const a = /* comment */ 1;';
		const result = stripComments(input);

		assert.equal(result, 'const a =  1;');
	});

	it('should collapse excessive blank lines to maximum of one', () => {
		const input = 'const a = 1;\n\n\n\nconst b = 2;';
		const result = stripComments(input);

		assert.equal(result, 'const a = 1;\n\nconst b = 2;');
	});

	it('should handle indented block comment without blank lines', () => {
		const input = '\t/**\n\t * Description\n\t */\n\tclass Foo {}';
		const result = stripComments(input);

		assert.equal(result, '\tclass Foo {}');
	});
});
