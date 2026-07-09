import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { extensionTarget, moduleTarget, runE2eForTarget } from '../../../src/commands/test/e2e-target';
import { E2ETestEngine } from '../../../src/modules/engines/test/e2e/e2e-test-engine';

import type { TestResult } from '../../../src/modules/engines/test/test-types';

function emptyResult(): TestResult
{
	return { report: [], stats: {}, consoleLogs: [], errors: [] };
}

describe('E2eTarget', () => {
	describe('extensionTarget', () => {
		it('reflects the package name, path and e2e tests dir', async () => {
			const pkg = {
				getName: () => 'ui.buttons',
				getPath: () => '/src/ui/buttons',
				getEndToEndTestsDirectoryPath: () => '/src/ui/buttons/test/e2e',
				getEndToEndTests: async () => ['a.spec.ts'],
			} as any;

			const target = extensionTarget(pkg);

			assert.equal(target.name, 'ui.buttons');
			assert.equal(target.path, '/src/ui/buttons');
			assert.equal(target.testsDirectory, '/src/ui/buttons/test/e2e');
			assert.deepEqual(await target.listTests(), ['a.spec.ts']);
		});
	});

	describe('moduleTarget', () => {
		it('uses the module tests dir as both path and tests dir', () => {
			const target = moduleTarget('crm');

			assert.equal(target.name, 'crm');
			// path and testsDirectory both point at <...>/crm/tests/chef/e2e
			assert.match(target.path, /crm[/\\]tests[/\\]chef[/\\]e2e$/);
			assert.equal(target.path, target.testsDirectory);
		});
	});

	describe('runE2eForTarget', () => {
		let sandbox: sinon.SinonSandbox;

		beforeEach(() => {
			sandbox = sinon.createSandbox();
		});

		afterEach(() => {
			sandbox.restore();
		});

		function fakeTarget(tests: string[])
		{
			return {
				name: 't',
				path: '/p',
				testsDirectory: '/p/tests',
				listTests: async () => tests,
			};
		}

		it('passes the target tests dir and hasTests into the engine (same path for any target)', async () => {
			const runStub = sandbox.stub(E2ETestEngine.prototype, 'run').resolves(emptyResult());

			await runE2eForTarget(fakeTarget(['x.spec.ts']), { headed: true, project: 'chromium' });

			assert.isTrue(runStub.calledOnce);
			const options = runStub.firstCall.args[0];
			assert.equal(options.testsDirectory, '/p/tests');
			assert.isTrue(options.hasTests);
			assert.isTrue(options.headed);
			assert.equal(options.project, 'chromium');
		});

		it('sets hasTests to false when the target has no tests', async () => {
			const runStub = sandbox.stub(E2ETestEngine.prototype, 'run').resolves(emptyResult());

			await runE2eForTarget(fakeTarget([]));

			assert.isFalse(runStub.firstCall.args[0].hasTests);
		});

		it('forwards the streaming callbacks', async () => {
			const runStub = sandbox.stub(E2ETestEngine.prototype, 'run').resolves(emptyResult());
			const onBegin = sinon.stub();

			await runE2eForTarget(fakeTarget(['x']), { onBegin });

			assert.strictEqual(runStub.firstCall.args[0].onBegin, onBegin);
		});
	});
});
