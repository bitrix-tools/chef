import { assert } from 'chai';

import { stripLineComments, stripComments } from '../../../../src/commands/diag/analyzers/file-scanner';

describe('stripLineComments', () => {
	it('should return code as-is when no comments', () => {
		const { code, stillInComment } = stripLineComments('const x = 1;', false);
		assert.equal(code, 'const x = 1;');
		assert.equal(stillInComment, false);
	});

	it('should strip single-line comment', () => {
		const { code, stillInComment } = stripLineComments('const x = 1; // comment', false);
		assert.equal(code, 'const x = 1; ');
		assert.equal(stillInComment, false);
	});

	it('should strip PHP hash comment', () => {
		const { code, stillInComment } = stripLineComments('# comment', false);
		assert.equal(code, '');
		assert.equal(stillInComment, false);
	});

	it('should strip inline block comment', () => {
		const { code, stillInComment } = stripLineComments('x /* comment */ = 1;', false);
		assert.equal(code, 'x  = 1;');
		assert.equal(stillInComment, false);
	});

	it('should track block comment start across lines', () => {
		const { code, stillInComment } = stripLineComments('x = 1; /*', false);
		assert.equal(code, 'x = 1; ');
		assert.equal(stillInComment, true);
	});

	it('should skip content inside block comment', () => {
		const { code, stillInComment } = stripLineComments('  still in comment */', true);
		assert.equal(code, '');
		assert.equal(stillInComment, false);
	});

	it('should not strip comment chars inside strings', () => {
		const { code } = stripLineComments(`const x = '// not a comment';`, false);
		assert.equal(code, `const x = '// not a comment';`);
	});

	it('should not strip comment chars inside double-quoted strings', () => {
		const { code } = stripLineComments(`const x = "/* not a comment */";`, false);
		assert.equal(code, `const x = "/* not a comment */";`);
	});

	it('should handle escaped quotes in strings', () => {
		const { code } = stripLineComments(`const x = 'it\\'s // fine';`, false);
		assert.equal(code, `const x = 'it\\'s // fine';`);
	});

	it('should handle template literals', () => {
		const { code } = stripLineComments('const x = `// template`;', false);
		assert.equal(code, 'const x = `// template`;');
	});
});

describe('stripComments', () => {
	it('should strip all types of comments from content', () => {
		const content = [
			'const a = 1; // line comment',
			'/* block',
			'   comment */',
			'const b = 2;',
		].join('\n');

		const result = stripComments(content);
		const lines = result.split('\n');

		assert.equal(lines[0], 'const a = 1; ');
		assert.equal(lines[1].trim(), '');
		assert.equal(lines[2].trim(), '');
		assert.equal(lines[3], 'const b = 2;');
	});

	it('should preserve strings with comment-like content', () => {
		const content = `const url = 'http://example.com'; // real comment`;
		const result = stripComments(content);

		assert.include(result, 'http://example.com');
		assert.notInclude(result, 'real comment');
	});
});
