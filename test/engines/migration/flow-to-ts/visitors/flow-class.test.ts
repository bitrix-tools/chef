import { describe, it } from 'mocha';
import { assert } from 'chai';

import { flowClassVisitor } from '../../../../../src/modules/engines/migration/flow-to-ts/visitors/flow-class';
import { applyVisitor } from '../test-utils';

describe('flowClassVisitor', () => {
	it('should convert covariant (+) to readonly', () => {
		const result = applyVisitor('class Foo { +name: string = "test"; }', flowClassVisitor);

		assert.include(result, 'readonly');
	});

	it('should remove contravariant (-)', () => {
		const result = applyVisitor('class Foo { -name: string = "test"; }', flowClassVisitor);

		assert.notInclude(result, '-name');
		assert.include(result, 'name');
	});

	it('should remove type annotations from array destructuring', () => {
		const result = applyVisitor('const [key: string, value: string] = prop;', flowClassVisitor);

		assert.notInclude(result, ': string');
		assert.include(result, '[key, value]');
	});
});
