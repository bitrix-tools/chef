import { describe, it } from 'mocha';
import { assert } from 'chai';

import { CF } from '../../src/diagnostics/diagnostic-codes';

describe('CF diagnostic codes', () => {
	it('should have build codes in CF1xxx range', () => {
		assert.match(CF.TS_TYPE_ERROR, /^CF1\d{3}$/);
		assert.match(CF.SYNTAX_ERROR, /^CF1\d{3}$/);
		assert.match(CF.MINIFICATION_ERROR, /^CF1\d{3}$/);
		assert.match(CF.CONCAT_FILE_NOT_FOUND, /^CF1\d{3}$/);
		assert.match(CF.CONCAT_FILE_READ_ERROR, /^CF1\d{3}$/);
		assert.match(CF.CIRCULAR_DEPENDENCY, /^CF1\d{3}$/);
		assert.match(CF.MISSING_EXPORT, /^CF1\d{3}$/);
		assert.match(CF.THIS_IS_UNDEFINED, /^CF1\d{3}$/);
		assert.match(CF.EVAL, /^CF1\d{3}$/);
		assert.match(CF.MISSING_GLOBAL_NAME, /^CF1\d{3}$/);
		assert.match(CF.UNUSED_EXTERNAL_IMPORT, /^CF1\d{3}$/);
		assert.match(CF.UNRESOLVED_IMPORT, /^CF1\d{3}$/);
		assert.match(CF.MISSING_IIFE_NAME, /^CF1\d{3}$/);
		assert.match(CF.PLUGIN_WARNING, /^CF1\d{3}$/);
		assert.match(CF.UNKNOWN_BUILD_WARNING, /^CF1\d{3}$/);
	});

	it('should have config codes in CF2xxx range', () => {
		assert.match(CF.OPTION_DENIED, /^CF2\d{3}$/);
		assert.match(CF.INVALID_CONFIG_VALUE, /^CF2\d{3}$/);
		assert.match(CF.PLAYWRIGHT_CONFIG_NOT_FOUND, /^CF2\d{3}$/);
		assert.match(CF.ENTRY_POINT_NOT_SET, /^CF2\d{3}$/);
	});

	it('should have test codes in CF3xxx range', () => {
		assert.match(CF.UNKNOWN_BROWSER, /^CF3\d{3}$/);
		assert.match(CF.NO_E2E_TESTS, /^CF3\d{3}$/);
		assert.match(CF.PLAYWRIGHT_ERROR, /^CF3\d{3}$/);
	});

	it('should have environment codes in CF5xxx range', () => {
		assert.match(CF.OUTSIDE_PROJECT_ROOT, /^CF5\d{3}$/);
	});

	it('should have internal codes in CF9xxx range', () => {
		assert.match(CF.PACKAGE_READ_ERROR, /^CF9\d{3}$/);
		assert.match(CF.UNCAUGHT_EXCEPTION, /^CF9\d{3}$/);
		assert.match(CF.FILE_CONVERSION_FAILED, /^CF9\d{3}$/);
		assert.match(CF.ALIAS_GENERATION_ERROR, /^CF9\d{3}$/);
		assert.match(CF.UNEXPECTED_BUILD_ERROR, /^CF9\d{3}$/);
	});

	it('should have no duplicate codes', () => {
		const values = Object.values(CF);
		const unique = new Set(values);

		assert.equal(values.length, unique.size, 'duplicate diagnostic codes found');
	});

	it('should have no duplicate names', () => {
		const keys = Object.keys(CF);
		const unique = new Set(keys);

		assert.equal(keys.length, unique.size, 'duplicate diagnostic names found');
	});
});
