import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { PackageLinter } from '../../src/modules/services/package-linter';
import { LintEngine } from '../../src/modules/engines/lint/lint-engine';
import { Environment } from '../../src/environment/environment';

import type { LintResult } from '../../src/modules/engines/lint/lint-types';

function createMockPackage(packagePath: string)
{
	return {
		getPath: () => packagePath,
		getOutputJsPath: () => `${packagePath}/dist/bundle.js`,
		getOutputCssPath: () => `${packagePath}/dist/bundle.css`,
	} as any;
}

function createMockLintResult(files: any[] = []): LintResult
{
	return {
		files,
		hasErrors: () => files.some((f: any) => f.messages.some((m: any) => m.severity === 'error')),
		getErrorsCount: () => files.reduce((acc: number, f: any) => acc + f.messages.filter((m: any) => m.severity === 'error').length, 0),
		hasWarnings: () => files.some((f: any) => f.messages.some((m: any) => m.severity === 'warning')),
		getWarningsCount: () => files.reduce((acc: number, f: any) => acc + f.messages.filter((m: any) => m.severity === 'warning').length, 0),
	};
}

describe('PackageLinter', () => {
	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
	});

	afterEach(() => {
		sandbox.restore();
	});

	it('should pass correct source path to lint engine', async () => {
		const packagePath = '/some/package/path';
		const rootPath = '/project/root';
		const mockPackage = createMockPackage(packagePath);

		sandbox.stub(Environment, 'getRoot').returns(rootPath);

		const lintResult = createMockLintResult();
		const lintStub = sandbox.stub(LintEngine.prototype, 'lint').resolves(lintResult);

		const linter = new PackageLinter(mockPackage);
		await linter.lint();

		assert.isTrue(lintStub.calledOnce);

		const options = lintStub.firstCall.args[0];
		assert.equal(options.sourcePath, `${packagePath}/src`);
		assert.equal(options.rootPath, rootPath);
	});

	it('should return lint result from engine', async () => {
		const mockPackage = createMockPackage('/test');

		sandbox.stub(Environment, 'getRoot').returns('/root');

		const expectedResult = createMockLintResult([
			{
				filePath: '/test/src/app.js',
				messages: [
					{ line: 1, column: 1, severity: 'error', message: 'Unexpected var', ruleId: 'no-var' },
				],
			},
		]);

		sandbox.stub(LintEngine.prototype, 'lint').resolves(expectedResult);

		const linter = new PackageLinter(mockPackage);
		const result = await linter.lint();

		assert.isTrue(result.hasErrors());
		assert.equal(result.getErrorsCount(), 1);
		assert.equal(result.files.length, 1);
		assert.equal(result.files[0].messages[0].ruleId, 'no-var');
	});

	it('should pass fix option to lint engine', async () => {
		const mockPackage = createMockPackage('/test');

		sandbox.stub(Environment, 'getRoot').returns('/root');

		const lintResult = createMockLintResult();
		const lintStub = sandbox.stub(LintEngine.prototype, 'lint').resolves(lintResult);

		const linter = new PackageLinter(mockPackage);
		await linter.lint({ fix: true });

		const options = lintStub.firstCall.args[0];
		assert.isTrue(options.fix);
	});

	it('should pass files option to lint engine', async () => {
		const mockPackage = createMockPackage('/test');

		sandbox.stub(Environment, 'getRoot').returns('/root');

		const lintResult = createMockLintResult();
		const lintStub = sandbox.stub(LintEngine.prototype, 'lint').resolves(lintResult);

		const linter = new PackageLinter(mockPackage);
		await linter.lint({ files: ['/test/src/app.js', '/test/src/utils.js'] });

		const options = lintStub.firstCall.args[0];
		assert.deepEqual(options.files, ['/test/src/app.js', '/test/src/utils.js']);
	});

	it('should merge user exclude with output paths', async () => {
		const mockPackage = createMockPackage('/test');

		sandbox.stub(Environment, 'getRoot').returns('/root');

		const lintResult = createMockLintResult();
		const lintStub = sandbox.stub(LintEngine.prototype, 'lint').resolves(lintResult);

		const linter = new PackageLinter(mockPackage);
		await linter.lint({ exclude: ['/test/src/legacy.js'] });

		const options = lintStub.firstCall.args[0];
		assert.include(options.exclude, '/test/dist/bundle.js');
		assert.include(options.exclude, '/test/dist/bundle.css');
		assert.include(options.exclude, '/test/src/legacy.js');
	});

	it('should pass cache option to lint engine', async () => {
		const mockPackage = createMockPackage('/test');

		sandbox.stub(Environment, 'getRoot').returns('/root');

		const lintResult = createMockLintResult();
		const lintStub = sandbox.stub(LintEngine.prototype, 'lint').resolves(lintResult);

		const linter = new PackageLinter(mockPackage);
		await linter.lint({ cache: false });

		const options = lintStub.firstCall.args[0];
		assert.isFalse(options.cache);
	});
});
