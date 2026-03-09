import { describe, it } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { TestEngine } from '../../../src/modules/engines/test/test-engine';
import { TestStrategy } from '../../../src/modules/engines/test/test-strategy';

import type {
	UnitTestOptions,
	E2ETestOptions,
	TestResult,
} from '../../../src/modules/engines/test/test-types';

class MockTestStrategy extends TestStrategy
{
	runUnitTestsStub = sinon.stub<[UnitTestOptions], Promise<TestResult>>();
	runEndToEndTestsStub = sinon.stub<[E2ETestOptions], Promise<TestResult>>();

	async runUnitTests(options: UnitTestOptions): Promise<TestResult>
	{
		return this.runUnitTestsStub(options);
	}

	async runEndToEndTests(options: E2ETestOptions): Promise<TestResult>
	{
		return this.runEndToEndTestsStub(options);
	}
}

function createMockTestResult(): TestResult
{
	return {
		report: [],
		stats: {},
		consoleLogs: [],
		errors: [],
		debugCleanup: null,
	};
}

describe('TestEngine', () => {
	it('should delegate runUnitTests to strategy', async () => {
		const strategy = new MockTestStrategy();
		const expected = createMockTestResult();
		strategy.runUnitTestsStub.resolves(expected);

		const engine = new TestEngine(strategy);
		const options = {
			packageName: 'test.pkg',
			packageRoot: '/test',
			projectRoot: '/root',
			publicPath: '/test/',
			targets: [],
			typescript: false,
			testFiles: ['test.ts'],
		} as UnitTestOptions;

		const result = await engine.runUnitTests(options);

		assert.strictEqual(result, expected);
		assert.isTrue(strategy.runUnitTestsStub.calledOnce);
		assert.equal(strategy.runUnitTestsStub.firstCall.args[0].packageName, 'test.pkg');
	});

	it('should delegate runEndToEndTests to strategy', async () => {
		const strategy = new MockTestStrategy();
		const expected = createMockTestResult();
		strategy.runEndToEndTestsStub.resolves(expected);

		const engine = new TestEngine(strategy);
		const options = {
			projectRoot: '/root',
			testsDirectory: '/test/e2e',
			hasTests: true,
		} as E2ETestOptions;

		const result = await engine.runEndToEndTests(options);

		assert.strictEqual(result, expected);
		assert.isTrue(strategy.runEndToEndTestsStub.calledOnce);
		assert.equal(strategy.runEndToEndTestsStub.firstCall.args[0].testsDirectory, '/test/e2e');
	});
});
