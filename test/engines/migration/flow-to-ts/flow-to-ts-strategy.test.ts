import { it, describe } from 'mocha';
import { assert } from 'chai';

import { code } from '../../../test-utils/code';
import { FlowToTsStrategy } from '../../../../src/modules/engines/migration/flow-to-ts/flow-to-ts-strategy';

const strategy = new FlowToTsStrategy();

async function migrate(source: string): Promise<string>
{
	const result = await strategy.migrate({ code: source });
	assert.isTrue(result.success);

	return result.code;
}

describe('FlowToTsStrategy', () => {
	it('Should remove @flow leading comment', async () => {
		const source = code`
			// @flow
			// // @flow

			import { Type } from 'main.core';
		`;

		const converted = await migrate(source);

		assert.equal(
			converted,
			code`
				import { Type } from 'main.core';
			`,
		);
	});

	it('Should convert $FlowFixMe, $FlowIgnore, $FlowExpectError comments to @ts-expect-error, @ts-ignore', async () => {
		const source = code`
			// $FlowFixMe
			export class TestFlow {}
			// $FlowIgnore
			export class TestFlow2 {}
			// $FlowExpectError
			export class TestFlow3 {}
		`;

		const converted = await migrate(source);

		assert.equal(
			converted,
			code`
				// @ts-expect-error
				export class TestFlow
				{}
				// @ts-ignore
				export class TestFlow2
				{}
				// @ts-expect-error
				export class TestFlow3
				{}
			`,
		);
	});

	it('Should convert import typeof to import type', async () => {
		const source = code`
			import typeof Type from 'main.core';
			import typeof { Type2 } from 'main.core';
			import { typeof Type3 } from 'main.core';
			import {
				typeof Type4,
				typeof Runtime,
				Tag,
				Dom,
				typeof Reflection,
			 } from 'main.core';
		`;

		const converted = await migrate(source);

		assert.equal(
			converted,
			code`
				import type Type from 'main.core';
				import type { Type2 } from 'main.core';
				import { type Type3 } from 'main.core';
				import { type Type4, type Runtime, Tag, Dom, type Reflection } from 'main.core';
			`,
		);
	});

	it('Should convert * type annotation to any', async () => {
		const source = code`
			export function testFlow(): *
			{
				return 222;
			}

			const name: * = 'name';
			type TestType = {
				name: *;
				id: number;
			};
		`;

		const converted = await migrate(source);

		assert.equal(
			converted,
			code`
				export function testFlow(): any
				{
					return 222;
				}

				const name: any = 'name';
				type TestType = {
					name: any;
					id: number;
				};
			`,
		);
	});

	it('Should convert covariant (+) and contravariant (-) modifiers to readonly', async () => {
		const source = code`
			export class TestFlow4
			{
				+covariant: string = 'testFlow';
				-contravariant: string = 'testFlow2';

				static +staticCovariant: string = 'testFlow3';
				static -contravariant: string = 'testFlow4';
			}
		`;

		const converted = await migrate(source);

		assert.equal(
			converted,
			code`
				export class TestFlow4
				{
					readonly covariant: string = 'testFlow';
					contravariant: string = 'testFlow2';

					static readonly staticCovariant: string = 'testFlow3';
					static contravariant: string = 'testFlow4';
				}
			`,
		);
	});

	it('Should convert opaque type to type alias', async () => {
		const source = code`
			opaque type Interval = [number, number];
			opaque type Interval2 = {
				name: string,
				interval: number,
			};

			export opaque type IncludeBoundariesValue = 'all' | 'left' | 'right' | 'none';
		`;

		const converted = await migrate(source);

		assert.equal(
			converted,
			code`
				type Interval = [number, number];
				type Interval2 = {
					name: string;
					interval: number;
				};

				export type IncludeBoundariesValue = 'all' | 'left' | 'right' | 'none';
			`,
		);
	});

	it('Should convert Flow utility types ($Exact, $Shape, $ReadOnly, $ReadOnlyArray) to TypeScript equivalents', async () => {
		const source = code`
			const uType1: $Exact<TestFlow> = {};
			function uType2(name: $Exact<TestFlow>): $Exact<TestFlow>
			{}
			function uType3(name: $Exact<TestFlow>, test: number): $Exact<TestFlow>
			{}

			const uType4: $Shape<TestFlow> = {};
			function uType5(name: $Shape<TestFlow>): $Shape<TestFlow>
			{}
			function uType6(name: $Shape<TestFlow>, test: string): $Shape<TestFlow>
			{}

			const uType7: $ReadOnly<TestFlow> = {};
			function uType8(name: $ReadOnly<TestFlow>): $ReadOnly<TestFlow>
			{}
			function uType9(name: $ReadOnly<TestFlow>, test: string): $ReadOnly<TestFlow>
			{}

			const uType10: $ReadOnlyArray<string> = [];
		`;

		const converted = await migrate(source);

		assert.equal(
			converted,
			code`
				const uType1: TestFlow = {};
				function uType2(name: TestFlow): TestFlow
				{}
				function uType3(name: TestFlow, test: number): TestFlow
				{}

				const uType4: Partial<TestFlow> = {};
				function uType5(name: Partial<TestFlow>): Partial<TestFlow>
				{}
				function uType6(name: Partial<TestFlow>, test: string): Partial<TestFlow>
				{}

				const uType7: Readonly<TestFlow> = {};
				function uType8(name: Readonly<TestFlow>): Readonly<TestFlow>
				{}
				function uType9(name: Readonly<TestFlow>, test: string): Readonly<TestFlow>
				{}

				const uType10: ReadonlyArray<string> = [];
			`,
		);
	});

	it('Should convert nullable type annotation (?T) to T | null | undefined', async () => {
		const source = code`
			function test(): ?MyType
			{}

			const test2: ?MyType = null;

			type CustomType = {
				test: ?MyType,
			};

			const arr = (param: ?MyType): ?MyType => {};
			const arr2 = (param: ?MyType): ?MyType | TestType => {};
			const arr3 = (param: ?MyType | Type): Type | ?MyType | TestType => {};
		`;

		const converted = await migrate(source);

		assert.equal(
			converted,
			code`
				function test(): MyType | null | undefined
				{}

				const test2: MyType | null | undefined = null;

				type CustomType = {
					test: MyType | null | undefined;
				};

				const arr = (param: MyType | null | undefined): MyType | null | undefined => {};
				const arr2 = (param: MyType | null | undefined): (MyType | null | undefined) | TestType => {};
				const arr3 = (param: (MyType | null | undefined) | Type): Type | (MyType | null | undefined) | TestType => {};
			`,
		);
	});

	it('Should remove type annotations from array destructuring pattern', async () => {
		const source = code`
			const [key: string, value: string = ''] = prop;
		`;

		const converted = await migrate(source);

		assert.equal(
			converted,
			code`
				const [key, value = ''] = prop;
			`,
		);
	});

	it('Should convert mixed to unknown', async () => {
		const source = code`
			function test(value: mixed): boolean
			{
				return true;
			}
		`;

		const converted = await migrate(source);

		assert.include(converted, 'value: unknown');
		assert.notInclude(converted, 'mixed');
	});

	it('Should convert $Values<T> to T[keyof T]', async () => {
		const source = code`
			type Status = $Values<StatusEnum>;
		`;

		const converted = await migrate(source);

		assert.include(converted, 'StatusEnum[keyof StatusEnum]');
		assert.notInclude(converted, '$Values');
	});

	it('Should convert $Keys<T> to keyof T', async () => {
		const source = code`
			function getSetting(name: $Keys<Options>): any
			{
				return null;
			}
		`;

		const converted = await migrate(source);

		assert.include(converted, 'keyof Options');
		assert.notInclude(converted, '$Keys');
	});

	it('Should convert $Diff<T, U> to Omit<T, keyof U>', async () => {
		const source = code`
			type Result = $Diff<FullOptions, DefaultOptions>;
		`;

		const converted = await migrate(source);

		assert.include(converted, 'Omit<FullOptions, keyof DefaultOptions>');
		assert.notInclude(converted, '$Diff');
	});

	it('Should convert $Call<F> to ReturnType<F>', async () => {
		const source = code`
			type Result = $Call<typeof myFn>;
		`;

		const converted = await migrate(source);

		assert.include(converted, 'ReturnType');
		assert.notInclude(converted, '$Call');
	});

	it('Should convert $NonMaybeType<T> to NonNullable<T>', async () => {
		const source = code`
			type Strict = $NonMaybeType<MaybeValue>;
		`;

		const converted = await migrate(source);

		assert.include(converted, 'NonNullable<MaybeValue>');
		assert.notInclude(converted, '$NonMaybeType');
	});

	it('Should convert Class<T> to constructor type', async () => {
		const source = code`
			type Factory = Class<MyService>;
		`;

		const converted = await migrate(source);

		assert.include(converted, 'new (...args: any[]) => MyService');
		assert.notInclude(converted, 'Class<');
	});

	it('Should convert Object<K, V> to Record<K, V>', async () => {
		const source = code`
			const data: Object<string, any> = {};
		`;

		const converted = await migrate(source);

		assert.include(converted, 'Record<string, any>');
		assert.notInclude(converted, 'Object<');
	});

	it('Should convert declare type to type', async () => {
		const source = code`
			declare type UserData = {
				id: number,
				name: string,
			};
		`;

		const converted = await migrate(source);

		assert.include(converted, 'type UserData');
		assert.notInclude(converted, 'declare type');
	});

	it('Should remove %checks predicate', async () => {
		const source = code`
			function isValid(value: any): boolean %checks
			{
				return typeof value === 'string';
			}
		`;

		const converted = await migrate(source);

		assert.include(converted, 'boolean');
		assert.notInclude(converted, '%checks');
	});

	it('Should convert Flow index signature [string: name] to [name: string]', async () => {
		const source = code`
			type Questions = {
				[string: questionId]: QuestionData,
			};
		`;

		const converted = await migrate(source);

		assert.include(converted, '[questionId: string]');
		assert.notInclude(converted, '[string: questionId]');
	});

	it('Should convert mixed in various positions', async () => {
		const source = code`
			function test(a: mixed, b: mixed): mixed
			{
				return a;
			}

			type Config = {
				value: mixed,
				items: Array<mixed>,
			};

			const x: mixed = null;
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, 'mixed');
		assert.include(converted, 'unknown');
	});

	it('Should handle $Values in class properties and function params', async () => {
		const source = code`
			type State = $Values<ProcessState>;

			class Foo
			{
				state: $Values<ProcessState> = 'idle';

				setState(newState: $Values<ProcessState>): void
				{}
			}
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, '$Values');
	});

	it('Should handle $Keys in various positions', async () => {
		const source = code`
			type Key = $Keys<Options>;

			function get(name: $Keys<Options>): any
			{
				return null;
			}

			function set(name: $Keys<Options>, value: any): void
			{}
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, '$Keys');
	});

	it('Should handle Class<T> in arrays and unions', async () => {
		const source = code`
			type FilterOption = Class<Filter> | string;
			type FilterList = Array<Class<Filter>>;
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, 'Class<');
		assert.include(converted, '(new (...args: any[]) => Filter) | string');
	});

	it('Should convert [$Keys<T>] to mapped type [K in keyof T]', async () => {
		const source = code`
			type Handlers = {
				[$Keys<ProcessCallback>]: (any) => void,
			};
		`;

		const converted = await migrate(source);

		assert.include(converted, '[K in keyof ProcessCallback]');
		assert.notInclude(converted, '$Keys');
	});

	it('Should handle Object<K, V> with nested generics', async () => {
		const source = code`
			const map: Object<string, Object<string, number>> = {};
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, 'Object<');
		assert.include(converted, 'Record<');
	});

	it('Should handle declare type with complex shape', async () => {
		const source = code`
			declare type StageParams = {
				id: number,
				name: string,
				color: ?string,
				items: Array<number>,
			};
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, 'declare type');
		assert.include(converted, 'type StageParams');
		assert.include(converted, 'string | null | undefined');
	});

	it('Should handle nested index signatures', async () => {
		const source = code`
			type Questions = {
				[string: questionId]: {
					ANSWERS: {
						[string: answerId]: AnswerData,
					},
				},
			};
		`;

		const converted = await migrate(source);

		assert.include(converted, '[questionId: string]');
		assert.include(converted, '[answerId: string]');
		assert.notInclude(converted, '[string:');
	});

	it('Should combine multiple Flow features in one file', async () => {
		const source = code`
			// @flow
			import typeof Type from 'main.core';

			declare type Options = {
				name: string,
				value: mixed,
				callback: ?Function,
			};

			opaque type ID = number;

			export class Widget
			{
				+name: string = '';
				-internal: number = 0;
				data: Object<string, any> = {};

				getOption(key: $Keys<Options>): mixed
				{
					return null;
				}
			}
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, '@flow');
		assert.notInclude(converted, 'import typeof');
		assert.notInclude(converted, 'declare type');
		assert.notInclude(converted, 'mixed');
		assert.notInclude(converted, 'opaque');
		assert.notInclude(converted, 'Object<');
		assert.notInclude(converted, '$Keys');
		assert.include(converted, 'readonly name');
		assert.include(converted, 'unknown');
		assert.include(converted, 'Record<');
		assert.include(converted, 'keyof Options');
	});

	it('Should add names to anonymous function type params', async () => {
		const source = code`
			type Handler = (string, number) => void;
			type Callback = any => {};
		`;

		const converted = await migrate(source);

		assert.include(converted, 'arg0: string');
		assert.include(converted, 'arg1: number');
		assert.include(converted, 'arg0: any');
		assert.notInclude(converted, '(string,');
	});

	it('Should handle function types in object type properties', async () => {
		const source = code`
			type ProcessCallback = {
				StateChanged: ($Values<ProcessState>, string) => void,
				RequestStart: FormData => void,
				RequestStop: any => void,
			};
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, '$Values');
		assert.include(converted, 'arg0');
	});

	it('Should remove optional marker from params with default values', async () => {
		const source = code`
			export class Widget
			{
				getSetting(name: string, defaultVal?: any = null): any
				{
					return null;
				}
			}
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, '?:');
		assert.notInclude(converted, '?: any');
		assert.include(converted, '= null');
	});

	it('Should convert spread types to intersection type', async () => {
		const source = code`
			type UseBlockDiagram = {
				...State,
				...UseGetters,
				...UseHooks,
				...UseActions,
			};
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, '...');
		assert.include(converted, 'State');
		assert.include(converted, 'UseGetters');
		assert.include(converted, '&');
	});

	it('Should convert spread types with properties to intersection', async () => {
		const source = code`
			type MenuOptions = {
				...BaseOptions,
				contentAttribute: ?string,
			};
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, '...');
		assert.include(converted, 'BaseOptions &');
		assert.include(converted, 'contentAttribute');
	});

	it('Should convert {...} to Record<string, any>', async () => {
		const source = code`
			export const PORT_TYPES: {...} = {
				INPUT: 'input',
				OUTPUT: 'output',
			};
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, '{...}');
		assert.include(converted, 'Record<string, any>');
	});

	it('Should handle nullable function type (?function)', async () => {
		const source = code`
			export class Timer
			{
				onEnd: ?function;
				onUpdate: ?Function;
			}
		`;

		const converted = await migrate(source);

		assert.include(converted, 'null');
	});

	it('Should remove type annotation from for-of variable', async () => {
		const source = code`
			function process(items: Array<string>): void
			{
				for (const item: string of items)
				{
					console.log(item);
				}
			}
		`;

		const converted = await migrate(source);

		assert.notInclude(converted, 'item: string of');
	});

	it('Should return original code on parse error', async () => {
		const source = '{{invalid code';
		const result = await strategy.migrate({ code: source });

		assert.isFalse(result.success);
		assert.equal(result.code, source);
	});
});
