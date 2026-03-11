import { describe, it } from 'mocha';
import { assert } from 'chai';

import { flowTypesVisitor } from '../../../../../src/modules/engines/migration/flow-to-ts/visitors/flow-types';
import { applyVisitor } from '../test-utils';

describe('flowTypesVisitor', () => {
	it('should convert * type annotation to any', () => {
		const result = applyVisitor('const name: * = "name";', flowTypesVisitor);

		assert.include(result, ': any');
		assert.notInclude(result, ': *');
	});

	it('should convert opaque type to type alias', () => {
		const result = applyVisitor('opaque type Interval = [number, number];', flowTypesVisitor);

		assert.include(result, 'type Interval');
		assert.notInclude(result, 'opaque');
	});

	it('should unwrap $Exact<T> to T', () => {
		const result = applyVisitor('const x: $Exact<Foo> = {};', flowTypesVisitor);

		assert.include(result, ': Foo');
		assert.notInclude(result, '$Exact');
	});

	it('should convert $Shape<T> to Partial<T>', () => {
		const result = applyVisitor('const x: $Shape<Foo> = {};', flowTypesVisitor);

		assert.include(result, 'Partial<Foo>');
	});

	it('should convert $ReadOnly<T> to Readonly<T>', () => {
		const result = applyVisitor('const x: $ReadOnly<Foo> = {};', flowTypesVisitor);

		assert.include(result, 'Readonly<Foo>');
	});

	it('should convert $ReadOnlyArray<T> to ReadonlyArray<T>', () => {
		const result = applyVisitor('const x: $ReadOnlyArray<string> = [];', flowTypesVisitor);

		assert.include(result, 'ReadonlyArray<string>');
	});

	it('should convert nullable ?T to T | null | void', () => {
		const result = applyVisitor('const x: ?MyType = null;', flowTypesVisitor);

		assert.include(result, 'MyType');
		assert.include(result, 'null');
		assert.include(result, 'void');
	});
});
