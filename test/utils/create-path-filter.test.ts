import { describe, it } from 'mocha';
import { assert } from 'chai';

import { createPathFilter } from '../../src/utils/create-path-filter';

describe('createPathFilter', () => {
	it('should return false for empty patterns', () => {
		const filter = createPathFilter([]);

		assert.isFalse(filter('/some/file.ts'));
	});

	it('should match exact paths', () => {
		const filter = createPathFilter(['/project/src/index.ts']);

		assert.isTrue(filter('/project/src/index.ts'));
		assert.isFalse(filter('/project/src/other.ts'));
	});

	it('should match glob patterns with *', () => {
		const filter = createPathFilter(['/project/src/old/*.js']);

		assert.isTrue(filter('/project/src/old/core.js'));
		assert.isTrue(filter('/project/src/old/utils.js'));
		assert.isFalse(filter('/project/src/new/core.js'));
	});

	it('should match glob patterns with **', () => {
		const filter = createPathFilter(['/project/src/old/**']);

		assert.isTrue(filter('/project/src/old/core.js'));
		assert.isTrue(filter('/project/src/old/nested/deep.ts'));
		assert.isFalse(filter('/project/src/new/core.js'));
	});

	it('should match glob patterns with ?', () => {
		const filter = createPathFilter(['/project/src/file?.ts']);

		assert.isTrue(filter('/project/src/file1.ts'));
		assert.isTrue(filter('/project/src/fileA.ts'));
		assert.isFalse(filter('/project/src/file10.ts'));
	});

	it('should match glob patterns with {braces}', () => {
		const filter = createPathFilter(['/project/src/**/*.{js,jsx}']);

		assert.isTrue(filter('/project/src/index.js'));
		assert.isTrue(filter('/project/src/app.jsx'));
		assert.isFalse(filter('/project/src/index.ts'));
	});

	it('should combine exact paths and globs', () => {
		const filter = createPathFilter([
			'/project/dist/bundle.js',
			'/project/src/old/**',
		]);

		assert.isTrue(filter('/project/dist/bundle.js'));
		assert.isTrue(filter('/project/src/old/core.js'));
		assert.isFalse(filter('/project/src/index.ts'));
	});

	it('should support multiple patterns', () => {
		const filter = createPathFilter([
			'/project/src/old/**',
			'/project/src/deprecated/**',
		]);

		assert.isTrue(filter('/project/src/old/core.js'));
		assert.isTrue(filter('/project/src/deprecated/utils.js'));
		assert.isFalse(filter('/project/src/index.ts'));
	});
});
