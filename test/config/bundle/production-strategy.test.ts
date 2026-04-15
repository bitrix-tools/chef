import { describe, it } from 'mocha';
import { assert } from 'chai';

import { productionStrategy } from '../../../src/modules/config/bundle/strategies/production-strategy';

describe('productionStrategy', () => {
	describe('validate', () => {
		it('should accept boolean true', () => {
			assert.isTrue(productionStrategy.validate(true));
		});

		it('should accept boolean false', () => {
			assert.isTrue(productionStrategy.validate(false));
		});

		it('should accept undefined', () => {
			assert.isTrue(productionStrategy.validate(undefined));
		});

		it('should reject string', () => {
			const result = productionStrategy.validate('true');
			assert.isString(result);
			assert.include(result as string, 'production');
		});

		it('should reject number', () => {
			const result = productionStrategy.validate(1);
			assert.isString(result);
		});

		it('should reject object', () => {
			const result = productionStrategy.validate({});
			assert.isString(result);
		});
	});

	describe('prepare', () => {
		it('should return true for true', () => {
			assert.isTrue(productionStrategy.prepare(true));
		});

		it('should return false for false', () => {
			assert.isFalse(productionStrategy.prepare(false));
		});

		it('should return false for undefined', () => {
			assert.isFalse(productionStrategy.prepare(undefined));
		});

		it('should return false for truthy non-boolean', () => {
			assert.isFalse(productionStrategy.prepare('true'));
		});
	});

	describe('getDefault', () => {
		it('should default to false', () => {
			assert.isFalse(productionStrategy.getDefault());
		});
	});
});
