import { describe, it } from 'mocha';
import { assert } from 'chai';
import { TraceMap } from '@jridgewell/trace-mapping';

import { mapStack } from '../../../../../src/modules/engines/test/unit/playwright/map-stack';

function createTraceMap(sources: string[], mappings: string): TraceMap
{
	return new TraceMap({
		version: 3,
		sources,
		names: [],
		mappings,
	} as any);
}

describe('mapStack', () => {
	it('should return stack unchanged when tracer has no matching source', () => {
		const tracer = createTraceMap([], '');
		const stack = 'Error: fail\n    at Object.<anonymous> (/some/file.js:10:5)';

		const result = mapStack(stack, tracer);

		assert.equal(result, stack);
	});

	it('should map Chromium-style <anonymous> frames', () => {
		const tracer = createTraceMap(
			['/src/app.ts'],
			'AAAA;AACA',
		);

		const stack = 'Error: fail\n    at fn (<anonymous>:2:1)';
		const result = mapStack(stack, tracer);

		assert.include(result, '/src/app.ts:');
		assert.notInclude(result, '<anonymous>');
	});

	it('should map Firefox-style mocha-wrapper.php frames', () => {
		const tracer = createTraceMap(
			['/src/app.ts'],
			'AAAA;AACA',
		);

		const stack = '@http://localhost:3000/dev/ui/cli/mocha-wrapper.php:2:1';
		const result = mapStack(stack, tracer);

		assert.include(result, '/src/app.ts:');
		assert.notInclude(result, 'mocha-wrapper.php');
	});

	it('should map WebKit-style mocha-wrapper.php frames', () => {
		const tracer = createTraceMap(
			['/src/app.ts'],
			'AAAA;AACA',
		);

		const stack = 'http://localhost:3000/dev/ui/cli/mocha-wrapper.php:2:1';
		const result = mapStack(stack, tracer);

		assert.include(result, '/src/app.ts:');
	});

	it('should preserve frames that do not match the pattern', () => {
		const tracer = createTraceMap([], '');
		const stack = 'Error: fail\n    at Object.<anonymous> (/real/file.ts:10:5)\n    at run (/node_modules/mocha/lib.js:5:3)';

		const result = mapStack(stack, tracer);

		assert.equal(result, stack);
	});

	it('should map injectedScript frames', () => {
		const tracer = createTraceMap(
			['/src/test.ts'],
			'AAAA;AACA',
		);

		const stack = 'at fn (injectedScript:2:1)';
		const result = mapStack(stack, tracer);

		assert.include(result, '/src/test.ts:');
		assert.notInclude(result, 'injectedScript');
	});

	it('should map multiple frames in one stack', () => {
		const tracer = createTraceMap(
			['/src/a.ts'],
			'AAAA;AACA;AACA',
		);

		const stack = 'Error\n    at a (<anonymous>:2:1)\n    at b (<anonymous>:3:1)';
		const result = mapStack(stack, tracer);

		assert.notInclude(result, '<anonymous>');
		const matches = result.match(/\/src\/a\.ts/g);
		assert.isNotNull(matches);
		assert.equal(matches!.length, 2);
	});
});
