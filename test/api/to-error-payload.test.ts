import { describe, it } from 'mocha';
import { assert } from 'chai';

import { toErrorPayload } from '../../src/api/to-error-payload';
import { ChefError } from '../../src/diagnostics/chef-error';
import { CF } from '../../src/diagnostics/diagnostic-codes';

describe('toErrorPayload', () => {
	it('preserves code from ChefError', () => {
		const error = new ChefError(CF.LINT_FAILED, 'lint failed');
		const payload = toErrorPayload(error);

		assert.equal(payload.code, CF.LINT_FAILED);
		assert.equal(payload.message, 'lint failed');
	});

	it('uses fallback code for plain Error', () => {
		const payload = toErrorPayload(new Error('boom'), CF.UNEXPECTED_BUILD_ERROR);

		assert.equal(payload.code, CF.UNEXPECTED_BUILD_ERROR);
		assert.equal(payload.message, 'boom');
	});

	it('uses default fallback (UNCAUGHT_EXCEPTION) when not provided', () => {
		const payload = toErrorPayload(new Error('boom'));

		assert.equal(payload.code, CF.UNCAUGHT_EXCEPTION);
	});

	it('handles non-Error values', () => {
		const payload = toErrorPayload('something string');

		assert.equal(payload.code, CF.UNCAUGHT_EXCEPTION);
		assert.equal(payload.message, 'something string');
	});

	it('handles null/undefined', () => {
		const a = toErrorPayload(null);
		const b = toErrorPayload(undefined);

		assert.isString(a.message);
		assert.isString(b.message);
	});

	it('does not throw on any input', () => {
		assert.doesNotThrow(() => toErrorPayload({ weird: 'object' }));
		assert.doesNotThrow(() => toErrorPayload(42));
		assert.doesNotThrow(() => toErrorPayload(true));
	});
});
