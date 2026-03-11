import { describe, it } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { E2ETestEngine } from '../../../../src/modules/engines/test/e2e/e2e-test-engine';
import { E2ETestStrategy } from '../../../../src/modules/engines/test/e2e/e2e-test-strategy';
import type { E2ETestOptions, TestResult } from '../../../../src/modules/engines/test/test-types';

class MockStrategy extends E2ETestStrategy
{
	runStub = sinon.stub<[E2ETestOptions], Promise<TestResult>>();

	async run(options: E2ETestOptions): Promise<TestResult>
	{
		return this.runStub(options);
	}
}

function createTestResult(): TestResult
{
	return { report: [], stats: {}, consoleLogs: [], errors: [] };
}

describe('E2ETestEngine', () => {
	it('should delegate run to strategy', async () => {
		const strategy = new MockStrategy();
		const expected = createTestResult();
		strategy.runStub.resolves(expected);

		const engine = new E2ETestEngine(strategy);
		const options = {
			projectRoot: '/root',
			testsDirectory: '/test/e2e',
			hasTests: true,
		} as E2ETestOptions;

		const result = await engine.run(options);

		assert.strictEqual(result, expected);
		assert.isTrue(strategy.runStub.calledOnceWith(options));
	});
});
