import { describe, it } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { LintEngine } from '../../../src/modules/engines/lint/lint-engine';
import { LintStrategy } from '../../../src/modules/engines/lint/lint-strategy';

import type { LintOptions, LintResult } from '../../../src/modules/engines/lint/lint-types';

class MockLintStrategy extends LintStrategy
{
	matchStub = sinon.stub<[LintOptions], boolean>().returns(true);
	lintStub = sinon.stub<[LintOptions], Promise<LintResult>>();

	match(options: LintOptions): boolean
	{
		return this.matchStub(options);
	}

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
	it('should delegate lint to matching strategy', async () => {
		const strategy = new MockLintStrategy();
		const expected = createMockLintResult();
		strategy.lintStub.resolves(expected);

		const engine = new LintEngine([strategy]);
		const result = await engine.lint({ sourcePath: '/src', rootPath: '/root' });

		assert.strictEqual(result, expected);
		assert.isTrue(strategy.lintStub.calledOnce);

		const options = strategy.lintStub.firstCall.args[0];
		assert.equal(options.sourcePath, '/src');
		assert.equal(options.rootPath, '/root');
	});

	it('should skip when no strategy matches', async () => {
		const strategy = new MockLintStrategy();
		strategy.matchStub.returns(false);

		const engine = new LintEngine([strategy]);
		const result = await engine.lint({ sourcePath: '/src', rootPath: '/root' });

		assert.isTrue(result.skipped);
		assert.isFalse(strategy.lintStub.called);
	});

	it('should use first matching strategy', async () => {
		const first = new MockLintStrategy();
		first.matchStub.returns(false);

		const second = new MockLintStrategy();
		const expected = createMockLintResult();
		second.lintStub.resolves(expected);

		const engine = new LintEngine([first, second]);
		const result = await engine.lint({ sourcePath: '/src', rootPath: '/root' });

		assert.strictEqual(result, expected);
		assert.isFalse(first.lintStub.called);
		assert.isTrue(second.lintStub.calledOnce);
	});
});
