import { describe, it } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { BuildEngine } from '../../../src/modules/engines/build/build-engine';
import { BuildStrategy } from '../../../src/modules/engines/build/build-strategy';

import type { BuildResult, BuildOptions, BuildCodeOptions, BuildCodeResult } from '../../../src/modules/engines/build/build-types';

function createMockBuildResult(): BuildResult
{
	return {
		warnings: [],
		errors: [],
		bundles: [],
		dependencies: ['main.core'],
		standalone: false,
	};
}

function createMockBuildCodeResult(): BuildCodeResult
{
	return {
		warnings: [],
		errors: [],
		code: 'var x = 1;',
		dependencies: [],
		map: null,
	};
}

class MockStrategy extends BuildStrategy
{
	buildStub = sinon.stub<[BuildOptions], Promise<BuildResult>>();
	buildCodeStub = sinon.stub<[BuildCodeOptions], Promise<BuildCodeResult>>();
	generateStub = sinon.stub<[BuildOptions], Promise<BuildResult>>();

	async build(options: BuildOptions): Promise<BuildResult>
	{
		return this.buildStub(options);
	}

	async buildCode(options: BuildCodeOptions): Promise<BuildCodeResult>
	{
		return this.buildCodeStub(options);
	}

	async generate(options: BuildOptions): Promise<BuildResult>
	{
		return this.generateStub(options);
	}
}

describe('BuildEngine', () => {
	it('should delegate build to strategy', async () => {
		const strategy = new MockStrategy();
		const expected = createMockBuildResult();
		strategy.buildStub.resolves(expected);

		const engine = new BuildEngine(strategy);
		const result = await engine.build({ input: 'test.js' } as BuildOptions);

		assert.strictEqual(result, expected);
		assert.isTrue(strategy.buildStub.calledOnce);
		assert.equal(strategy.buildStub.firstCall.args[0].input, 'test.js');
	});

	it('should delegate buildCode to strategy', async () => {
		const strategy = new MockStrategy();
		const expected = createMockBuildCodeResult();
		strategy.buildCodeStub.resolves(expected);

		const engine = new BuildEngine(strategy);
		const result = await engine.buildCode({ code: 'var x = 1;' } as BuildCodeOptions);

		assert.strictEqual(result, expected);
		assert.isTrue(strategy.buildCodeStub.calledOnce);
	});

	it('should delegate generate to strategy', async () => {
		const strategy = new MockStrategy();
		const expected = createMockBuildResult();
		strategy.generateStub.resolves(expected);

		const engine = new BuildEngine(strategy);
		const result = await engine.generate({ input: 'test.js' } as BuildOptions);

		assert.strictEqual(result, expected);
		assert.isTrue(strategy.generateStub.calledOnce);
	});
});
