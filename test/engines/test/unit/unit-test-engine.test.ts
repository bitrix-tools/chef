import { describe, it } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { UnitTestEngine } from '../../../../src/modules/engines/test/unit/unit-test-engine';
import { UnitTestStrategy } from '../../../../src/modules/engines/test/unit/unit-test-strategy';
import type { UnitTestOptions, TestResult } from '../../../../src/modules/engines/test/test-types';

class MockStrategy extends UnitTestStrategy
{
	runStub = sinon.stub<[UnitTestOptions], Promise<TestResult>>();

	async run(options: UnitTestOptions): Promise<TestResult>
	{
		return this.runStub(options);
	}
}

function createTestResult(): TestResult
{
	return { report: [], stats: {}, consoleLogs: [], errors: [] };
}

describe('UnitTestEngine', () => {
	it('should delegate run to strategy', async () => {
		const strategy = new MockStrategy();
		const expected = createTestResult();
		strategy.runStub.resolves(expected);

		const engine = new UnitTestEngine(strategy);
		const options = {
			packageName: 'test.pkg',
			packageRoot: '/test',
			projectRoot: '/root',
			publicPath: '/test/',
			targets: [],
			typescript: false,
			testFiles: [],
		} as UnitTestOptions;

		const result = await engine.run(options);

		assert.strictEqual(result, expected);
		assert.isTrue(strategy.runStub.calledOnceWith(options));
	});
});
