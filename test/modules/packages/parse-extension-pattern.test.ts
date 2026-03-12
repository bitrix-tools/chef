import { describe, it } from 'mocha';
import { assert } from 'chai';

import { parseExtensionPattern } from '../../../src/modules/packages/package-resolver';

describe('parseExtensionPattern', () => {
	describe('single wildcard (*)', () => {
		it('should match one level deep for trailing *', () => {
			const result = parseExtensionPattern('im.v2.*');

			assert.deepEqual(result.fixedSegments, ['im', 'v2']);
			assert.deepEqual(result.configPatterns, [
				'*/bundle.config.js',
				'*/bundle.config.ts',
			]);
		});

		it('should match one level for single prefix', () => {
			const result = parseExtensionPattern('ui.*');

			assert.deepEqual(result.fixedSegments, ['ui']);
			assert.deepEqual(result.configPatterns, [
				'*/bundle.config.js',
				'*/bundle.config.ts',
			]);
		});

		it('should support wildcard in the middle', () => {
			const result = parseExtensionPattern('im.*.model');

			assert.deepEqual(result.fixedSegments, ['im']);
			assert.deepEqual(result.configPatterns, [
				'*/model/bundle.config.js',
				'*/model/bundle.config.ts',
			]);
		});

		it('should handle wildcard as first segment', () => {
			const result = parseExtensionPattern('*.core');

			assert.deepEqual(result.fixedSegments, []);
			assert.deepEqual(result.configPatterns, [
				'*/core/bundle.config.js',
				'*/core/bundle.config.ts',
			]);
		});
	});

	describe('double wildcard (**)', () => {
		it('should match all nested levels for trailing **', () => {
			const result = parseExtensionPattern('im.v2.**');

			assert.deepEqual(result.fixedSegments, ['im', 'v2']);
			assert.deepEqual(result.configPatterns, [
				'**/bundle.config.js',
				'**/bundle.config.ts',
			]);
		});

		it('should match all nested for single prefix', () => {
			const result = parseExtensionPattern('ui.**');

			assert.deepEqual(result.fixedSegments, ['ui']);
			assert.deepEqual(result.configPatterns, [
				'**/bundle.config.js',
				'**/bundle.config.ts',
			]);
		});

		it('should support ** in the middle', () => {
			const result = parseExtensionPattern('im.**.model');

			assert.deepEqual(result.fixedSegments, ['im']);
			assert.deepEqual(result.configPatterns, [
				'**/model/bundle.config.js',
				'**/model/bundle.config.ts',
			]);
		});
	});

	describe('mixed patterns', () => {
		it('should handle deep fixed prefix with *', () => {
			const result = parseExtensionPattern('im.v2.provider.*');

			assert.deepEqual(result.fixedSegments, ['im', 'v2', 'provider']);
			assert.deepEqual(result.configPatterns, [
				'*/bundle.config.js',
				'*/bundle.config.ts',
			]);
		});

		it('should handle deep fixed prefix with **', () => {
			const result = parseExtensionPattern('im.v2.provider.**');

			assert.deepEqual(result.fixedSegments, ['im', 'v2', 'provider']);
			assert.deepEqual(result.configPatterns, [
				'**/bundle.config.js',
				'**/bundle.config.ts',
			]);
		});

		it('should handle * followed by fixed segment', () => {
			const result = parseExtensionPattern('ui.bbcode.*.parser');

			assert.deepEqual(result.fixedSegments, ['ui', 'bbcode']);
			assert.deepEqual(result.configPatterns, [
				'*/parser/bundle.config.js',
				'*/parser/bundle.config.ts',
			]);
		});
	});
});
