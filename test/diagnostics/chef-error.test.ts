import { describe, it } from 'mocha';
import { assert } from 'chai';

import { ChefError } from '../../src/diagnostics/chef-error';

describe('ChefError', () => {
	it('should be an instance of Error', () => {
		const error = new ChefError('CF1001', 'Type error');

		assert.instanceOf(error, Error);
	});

	it('should store the code', () => {
		const error = new ChefError('CF1002', 'Syntax error');

		assert.equal(error.code, 'CF1002');
	});

	it('should store the message', () => {
		const error = new ChefError('CF1001', 'Type mismatch');

		assert.equal(error.message, 'Type mismatch');
	});

	it('should have a stack trace', () => {
		const error = new ChefError('CF9001', 'Internal error');

		assert.isString(error.stack);
		assert.include(error.stack!, 'Internal error');
	});

	it('should have readonly code', () => {
		const error = new ChefError('CF1001', 'Error');

		// TypeScript readonly prevents assignment, but verify the value is set
		assert.equal(error.code, 'CF1001');
	});
});
