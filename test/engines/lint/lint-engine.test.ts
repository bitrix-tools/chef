import { describe, it } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { LintEngine } from '../../../src/modules/engines/lint/lint-engine';
import { LintStrategy } from '../../../src/modules/engines/lint/lint-strategy';

import type { LintOptions, LintResult } from '../../../src/modules/engines/lint/lint-types';

class MockLintStrategy extends LintStrategy
{
	lintStub = sinon.stub<[LintOptions], Promise<LintResult>>();

	async lint(options: LintOptions): Promise<LintResult>
	{
		return this.lintStub(options);
	}
}

function createMockLintResult(overrides: Partial<LintResult> = {}): LintResult
{
	return {
		files: [],
		hasErrors: () => false,
		getErrorsCount: () => 0,
		hasWarnings: () => false,
		getWarningsCount: () => 0,
		...overrides,
	};
}

describe('LintEngine', () => {
	it('should delegate lint to strategy', async () => {
		const strategy = new MockLintStrategy();
		const expected = createMockLintResult();
		strategy.lintStub.resolves(expected);

		const engine = new LintEngine(strategy);
		const result = await engine.lint({ sourcePath: '/src', rootPath: '/root' });

		assert.strictEqual(result, expected);
		assert.isTrue(strategy.lintStub.calledOnce);

		const options = strategy.lintStub.firstCall.args[0];
		assert.equal(options.sourcePath, '/src');
		assert.equal(options.rootPath, '/root');
	});
});
