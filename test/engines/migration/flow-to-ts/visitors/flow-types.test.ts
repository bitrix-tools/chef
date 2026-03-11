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

	it('should convert mixed to unknown', () => {
		const result = applyVisitor('function test(value: mixed): boolean { return true; }', flowTypesVisitor);

		assert.include(result, 'unknown');
		assert.notInclude(result, 'mixed');
	});

	it('should convert $NonMaybeType<T> to NonNullable<T>', () => {
		const result = applyVisitor('type X = $NonMaybeType<Y>;', flowTypesVisitor);

		assert.include(result, 'NonNullable<Y>');
	});

	it('should convert declare type to type', () => {
		const result = applyVisitor('declare type Foo = { id: number };', flowTypesVisitor);

		assert.include(result, 'type Foo');
		assert.notInclude(result, 'declare');
	});

	it('should remove %checks predicate', () => {
		const result = applyVisitor('function isValid(x: any): boolean %checks { return true; }', flowTypesVisitor);

		assert.notInclude(result, '%checks');
		assert.include(result, 'boolean');
	});

	it('should add names to anonymous function type params', () => {
		const result = applyVisitor('type Fn = (string, number) => void;', flowTypesVisitor);

		assert.include(result, 'arg0: string');
		assert.include(result, 'arg1: number');
	});

	it('should add name to single anonymous function type param', () => {
		const result = applyVisitor('type Fn = any => {};', flowTypesVisitor);

		assert.include(result, 'arg0: any');
	});

	it('should not rename already named function type params', () => {
		const result = applyVisitor('type Fn = (name: string) => void;', flowTypesVisitor);

		assert.include(result, 'name: string');
		assert.notInclude(result, 'arg0');
	});

	it('should remove optional marker from params with default values', () => {
		const result = applyVisitor('function test(val?: any = null) {}', flowTypesVisitor);

		assert.notInclude(result, '?');
		assert.include(result, 'val');
		assert.include(result, '= null');
	});

	it('should remove optional from class method params with defaults', () => {
		const result = applyVisitor('class Foo { test(val?: string = "x") {} }', flowTypesVisitor);

		assert.notInclude(result, '?');
	});

	it('should convert spread types to intersection', () => {
		const result = applyVisitor('type T = { ...State, ...Getters };', flowTypesVisitor);

		assert.include(result, 'State & Getters');
		assert.notInclude(result, '...');
	});

	it('should convert spread type with regular properties to intersection', () => {
		const result = applyVisitor('type T = { ...State, name: string };', flowTypesVisitor);

		assert.include(result, 'State &');
		assert.include(result, 'name: string');
	});
});
