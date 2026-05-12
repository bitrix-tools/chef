import { describe, it } from 'mocha';
import { assert } from 'chai';

import { normalizePath } from '../../src/utils/path/normalize';

describe('normalizePath', () => {
	it('passes plain POSIX paths through', () => {
		assert.equal(normalizePath('local/js/ui/buttons/src'), 'local/js/ui/buttons/src');
		assert.equal(normalizePath('/home/me/foo.ts'), '/home/me/foo.ts');
	});

	it('converts Windows-style backslashes to forward slashes', () => {
		assert.equal(normalizePath('local\\js\\ui\\buttons\\src'), 'local/js/ui/buttons/src');
		assert.equal(normalizePath('C:\\Users\\me\\foo.ts'), 'C:/Users/me/foo.ts');
	});

	it('collapses redundant segments via path.posix.normalize', () => {
		assert.equal(normalizePath('foo/./bar'), 'foo/bar');
		assert.equal(normalizePath('foo/bar/../baz'), 'foo/baz');
		assert.equal(normalizePath('foo//bar'), 'foo/bar');
	});

	it('handles mixed separators', () => {
		assert.equal(normalizePath('local\\js/ui\\buttons'), 'local/js/ui/buttons');
	});

	it('preserves the leading "./" only when path.posix.normalize would', () => {
		// path.posix.normalize strips a leading "./" — match that behaviour.
		assert.equal(normalizePath('./foo'), 'foo');
	});
});
