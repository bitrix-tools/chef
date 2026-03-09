import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { PackageTestRunner } from '../../src/modules/services/package-test-runner';
import { TestEngine } from '../../src/modules/engines/test/test-engine';
import { Environment } from '../../src/environment/environment';

import type { TestResult } from '../../src/modules/engines/test/test-types';

function createMockTestResult(overrides: Partial<TestResult> = {}): TestResult
{
	return {
		report: [],
		stats: {},
		consoleLogs: [],
		errors: [],
		debugCleanup: null,
		...overrides,
	};
}

function createMockPackage(options: {
	name?: string;
	packagePath?: string;
	publicPath?: string;
	targets?: string[];
	typescript?: boolean;
	unitTests?: string[];
	e2eTests?: string[];
	e2eTestsDir?: string;
} = {})
{
	return {
		getName: () => options.name ?? 'test.package',
		getPath: () => options.packagePath ?? '/test/package',
		getPublicPath: () => options.publicPath ?? '/test/',
		getTargets: () => options.targets ?? [],
		isTypeScriptMode: () => options.typescript ?? false,
		getUnitTests: async () => options.unitTests ?? [],
		getEndToEndTests: async () => options.e2eTests ?? [],
		getEndToEndTestsDirectoryPath: () => options.e2eTestsDir ?? '/test/package/test/e2e',
	} as any;
}

describe('PackageTestRunner', () => {
	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		sandbox.stub(Environment, 'getRoot').returns('/project/root');
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('runUnitTests', () => {
		it('should pass correct options to test engine', async () => {
			const testFiles = ['test/unit/app.test.ts'];
			const mockPackage = createMockPackage({
				name: 'ui.buttons',
				packagePath: '/src/ui/buttons',
				publicPath: '/bitrix/js/ui/buttons/',
				targets: ['chrome 90'],
				typescript: true,
				unitTests: testFiles,
			});

			const expectedResult = createMockTestResult();
			const runStub = sandbox.stub(TestEngine.prototype, 'runUnitTests').resolves(expectedResult);

			const runner = new PackageTestRunner(mockPackage);
			const result = await runner.runUnitTests({
				browserType: 'chromium',
				headed: true,
				debug: false,
				grep: 'should work',
			});

			assert.isTrue(runStub.calledOnce);

			const options = runStub.firstCall.args[0];
			assert.equal(options.packageName, 'ui.buttons');
			assert.equal(options.packageRoot, '/src/ui/buttons');
			assert.equal(options.projectRoot, '/project/root');
			assert.equal(options.publicPath, '/bitrix/js/ui/buttons/');
			assert.deepEqual(options.targets, ['chrome 90']);
			assert.isTrue(options.typescript);
			assert.deepEqual(options.testFiles, testFiles);
			assert.equal(options.browserType, 'chromium');
			assert.isTrue(options.headed);
			assert.isFalse(options.debug);
			assert.equal(options.grep, 'should work');

			assert.strictEqual(result, expectedResult);
		});

		it('should pass callbacks to test engine', async () => {
			const mockPackage = createMockPackage();
			const expectedResult = createMockTestResult();
			sandbox.stub(TestEngine.prototype, 'runUnitTests').resolves(expectedResult);

			const onToken = sinon.stub();
			const onStatus = sinon.stub();

			const runner = new PackageTestRunner(mockPackage);
			await runner.runUnitTests({ onToken, onStatus });

			const options = (TestEngine.prototype.runUnitTests as sinon.SinonStub).firstCall.args[0];
			assert.strictEqual(options.onToken, onToken);
			assert.strictEqual(options.onStatus, onStatus);
		});

		it('should use default empty args', async () => {
			const mockPackage = createMockPackage();
			sandbox.stub(TestEngine.prototype, 'runUnitTests').resolves(createMockTestResult());

			const runner = new PackageTestRunner(mockPackage);
			await runner.runUnitTests();

			const options = (TestEngine.prototype.runUnitTests as sinon.SinonStub).firstCall.args[0];
			assert.isUndefined(options.browserType);
			assert.isUndefined(options.headed);
			assert.isUndefined(options.debug);
		});
	});

	describe('runEndToEndTests', () => {
		it('should pass correct options to test engine', async () => {
			const mockPackage = createMockPackage({
				e2eTests: ['test/e2e/app.spec.ts'],
				e2eTestsDir: '/src/ui/buttons/test/e2e',
			});

			const expectedResult = createMockTestResult();
			const runStub = sandbox.stub(TestEngine.prototype, 'runEndToEndTests').resolves(expectedResult);

			const runner = new PackageTestRunner(mockPackage);
			const result = await runner.runEndToEndTests({
				headed: true,
				project: 'chromium',
			});

			assert.isTrue(runStub.calledOnce);

			const options = runStub.firstCall.args[0];
			assert.equal(options.projectRoot, '/project/root');
			assert.equal(options.testsDirectory, '/src/ui/buttons/test/e2e');
			assert.isTrue(options.hasTests);
			assert.isTrue(options.headed);
			assert.equal(options.project, 'chromium');

			assert.strictEqual(result, expectedResult);
		});

		it('should set hasTests to false when no e2e tests found', async () => {
			const mockPackage = createMockPackage({ e2eTests: [] });
			sandbox.stub(TestEngine.prototype, 'runEndToEndTests').resolves(createMockTestResult());

			const runner = new PackageTestRunner(mockPackage);
			await runner.runEndToEndTests();

			const options = (TestEngine.prototype.runEndToEndTests as sinon.SinonStub).firstCall.args[0];
			assert.isFalse(options.hasTests);
		});

		it('should pass onBegin callback', async () => {
			const mockPackage = createMockPackage();
			sandbox.stub(TestEngine.prototype, 'runEndToEndTests').resolves(createMockTestResult());

			const onBegin = sinon.stub();
			const runner = new PackageTestRunner(mockPackage);
			await runner.runEndToEndTests({ onBegin });

			const options = (TestEngine.prototype.runEndToEndTests as sinon.SinonStub).firstCall.args[0];
			assert.strictEqual(options.onBegin, onBegin);
		});
	});
});
