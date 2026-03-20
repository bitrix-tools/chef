import { assert } from 'chai';

import { analyzeConfig, analyzeConfigExcept, analyzeConfigMissing } from '../../../../src/commands/diag/analyzers/config-analyzer';
import { createSnapshot } from '../create-snapshot';

describe('analyzeConfig', () => {
	it('should find packages with specified key', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleConfig: { namespace: 'BX.A' } }),
			createSnapshot({ name: 'b', bundleConfig: {} }),
			createSnapshot({ name: 'c', bundleConfig: { namespace: 'BX.C' } }),
		];

		const results = analyzeConfig(packages, ['namespace']);

		assert.equal(results.length, 2);
		assert.equal(results[0].name, 'a');
		assert.equal(results[0].key, 'namespace');
		assert.equal(results[0].value, 'BX.A');
		assert.equal(results[1].name, 'c');
	});

	it('should search multiple keys with OR logic', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleConfig: { concat: true } }),
			createSnapshot({ name: 'b', bundleConfig: { minification: true } }),
			createSnapshot({ name: 'c', bundleConfig: {} }),
		];

		const results = analyzeConfig(packages, ['concat', 'minification']);

		assert.equal(results.length, 2);
	});

	it('should filter by string value with substring match', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleConfig: { namespace: 'BX.UI.BBCode' } }),
			createSnapshot({ name: 'b', bundleConfig: { namespace: 'BX.Main' } }),
		];

		const results = analyzeConfig(packages, ['namespace'], 'BBCode');

		assert.equal(results.length, 1);
		assert.equal(results[0].name, 'a');
	});

	it('should filter by array value with contains match', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleConfig: { targets: ['chrome 100', 'firefox 90'] } }),
			createSnapshot({ name: 'b', bundleConfig: { targets: ['safari 15'] } }),
		];

		const results = analyzeConfig(packages, ['targets'], 'chrome');

		assert.equal(results.length, 1);
		assert.equal(results[0].name, 'a');
	});

	it('should filter by boolean value', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleConfig: { minification: true } }),
			createSnapshot({ name: 'b', bundleConfig: { minification: false } }),
		];

		const results = analyzeConfig(packages, ['minification'], 'true');

		assert.equal(results.length, 1);
		assert.equal(results[0].name, 'a');
	});

	it('should skip undefined values', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleConfig: {} }),
		];

		const results = analyzeConfig(packages, ['namespace']);

		assert.equal(results.length, 0);
	});

	it('should sort results by name', () => {
		const packages = [
			createSnapshot({ name: 'c', bundleConfig: { x: 1 } }),
			createSnapshot({ name: 'a', bundleConfig: { x: 2 } }),
			createSnapshot({ name: 'b', bundleConfig: { x: 3 } }),
		];

		const results = analyzeConfig(packages, ['x']);

		assert.equal(results[0].name, 'a');
		assert.equal(results[1].name, 'b');
		assert.equal(results[2].name, 'c');
	});
});

describe('analyzeConfigExcept', () => {
	it('should find keys not in the exclude set', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleConfig: { input: './src/app.js', output: './dist', minification: true } }),
		];

		const results = analyzeConfigExcept(packages, new Set(['input', 'output']));

		assert.equal(results.length, 1);
		assert.deepEqual(results[0].entries, [{ key: 'minification', value: true }]);
	});

	it('should return empty when all keys are excluded', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleConfig: { input: './src/app.js' } }),
		];

		const results = analyzeConfigExcept(packages, new Set(['input']));

		assert.equal(results.length, 0);
	});

	it('should sort by name and group entries', () => {
		const packages = [
			createSnapshot({ name: 'b', bundleConfig: { z: 1, a: 2 } }),
			createSnapshot({ name: 'a', bundleConfig: { m: 3 } }),
		];

		const results = analyzeConfigExcept(packages, new Set());

		assert.equal(results.length, 2);
		assert.equal(results[0].name, 'a');
		assert.deepEqual(results[0].entries, [{ key: 'm', value: 3 }]);
		assert.equal(results[1].name, 'b');
		assert.deepEqual(results[1].entries, [{ key: 'a', value: 2 }, { key: 'z', value: 1 }]);
	});
});

describe('analyzeConfigMissing', () => {
	it('should find packages missing specified keys', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleConfig: { namespace: 'BX.A' } }),
			createSnapshot({ name: 'b', bundleConfig: {} }),
		];

		const results = analyzeConfigMissing(packages, ['namespace']);

		assert.equal(results.length, 1);
		assert.equal(results[0].name, 'b');
		assert.deepEqual(results[0].missingKeys, ['namespace']);
	});

	it('should report which keys are missing', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleConfig: { namespace: 'BX.A' } }),
		];

		const results = analyzeConfigMissing(packages, ['namespace', 'minification']);

		assert.equal(results.length, 1);
		assert.deepEqual(results[0].missingKeys, ['minification']);
	});

	it('should return empty when all keys present', () => {
		const packages = [
			createSnapshot({ name: 'a', bundleConfig: { x: 1, y: 2 } }),
		];

		const results = analyzeConfigMissing(packages, ['x', 'y']);

		assert.equal(results.length, 0);
	});

	it('should sort results by name', () => {
		const packages = [
			createSnapshot({ name: 'c', bundleConfig: {} }),
			createSnapshot({ name: 'a', bundleConfig: {} }),
		];

		const results = analyzeConfigMissing(packages, ['x']);

		assert.equal(results[0].name, 'a');
		assert.equal(results[1].name, 'c');
	});
});
