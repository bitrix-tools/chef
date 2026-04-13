import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { BasePackage } from '../../../src/modules/packages/base-package';

class TestPackage extends BasePackage
{
	getName(): string
	{
		return 'test.package';
	}

	getModuleName(): string
	{
		return 'test';
	}
}

function createTempDir(): string
{
	return fs.mkdtempSync(path.join(os.tmpdir(), 'chef-test-'));
}

function mkdirp(dirPath: string): void
{
	fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath: string, content: string = ''): void
{
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content);
}

describe('BasePackage test directories', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	describe('getUnitTestsDirectoryPath', () => {
		it('should return test/unit when it exists', () => {
			mkdirp(path.join(tempDir, 'test', 'unit'));
			const pkg = new TestPackage({ path: tempDir });

			assert.equal(pkg.getUnitTestsDirectoryPath(), path.join(tempDir, 'test', 'unit'));
		});

		it('should return tests/unit when it exists and test/unit does not', () => {
			mkdirp(path.join(tempDir, 'tests', 'unit'));
			const pkg = new TestPackage({ path: tempDir });

			assert.equal(pkg.getUnitTestsDirectoryPath(), path.join(tempDir, 'tests', 'unit'));
		});

		it('should prefer test/unit over tests/unit when both exist', () => {
			mkdirp(path.join(tempDir, 'test', 'unit'));
			mkdirp(path.join(tempDir, 'tests', 'unit'));
			const pkg = new TestPackage({ path: tempDir });

			assert.equal(pkg.getUnitTestsDirectoryPath(), path.join(tempDir, 'test', 'unit'));
		});

		it('should fallback to test/ for legacy structure', () => {
			mkdirp(path.join(tempDir, 'test'));
			const pkg = new TestPackage({ path: tempDir });

			assert.equal(pkg.getUnitTestsDirectoryPath(), path.join(tempDir, 'test'));
		});

		it('should fallback to tests/ for legacy structure when test/ does not exist', () => {
			mkdirp(path.join(tempDir, 'tests'));
			const pkg = new TestPackage({ path: tempDir });

			assert.equal(pkg.getUnitTestsDirectoryPath(), path.join(tempDir, 'tests'));
		});

		it('should return test/ when neither test/ nor tests/ exist', () => {
			const pkg = new TestPackage({ path: tempDir });

			assert.equal(pkg.getUnitTestsDirectoryPath(), path.join(tempDir, 'test'));
		});
	});

	describe('getEndToEndTestsDirectoryPath', () => {
		it('should return test/e2e when it exists', () => {
			mkdirp(path.join(tempDir, 'test', 'e2e'));
			const pkg = new TestPackage({ path: tempDir });

			assert.equal(pkg.getEndToEndTestsDirectoryPath(), path.join(tempDir, 'test', 'e2e'));
		});

		it('should return tests/e2e when it exists and test/e2e does not', () => {
			mkdirp(path.join(tempDir, 'tests', 'e2e'));
			const pkg = new TestPackage({ path: tempDir });

			assert.equal(pkg.getEndToEndTestsDirectoryPath(), path.join(tempDir, 'tests', 'e2e'));
		});

		it('should prefer test/e2e over tests/e2e when both exist', () => {
			mkdirp(path.join(tempDir, 'test', 'e2e'));
			mkdirp(path.join(tempDir, 'tests', 'e2e'));
			const pkg = new TestPackage({ path: tempDir });

			assert.equal(pkg.getEndToEndTestsDirectoryPath(), path.join(tempDir, 'test', 'e2e'));
		});

		it('should return test/e2e when neither exists', () => {
			const pkg = new TestPackage({ path: tempDir });

			assert.equal(pkg.getEndToEndTestsDirectoryPath(), path.join(tempDir, 'test', 'e2e'));
		});
	});

	describe('getUnitTests', () => {
		it('should find tests in test/unit', async () => {
			writeFile(path.join(tempDir, 'test', 'unit', 'app.test.ts'));
			const pkg = new TestPackage({ path: tempDir });

			const tests = await pkg.getUnitTests();
			assert.lengthOf(tests, 1);
			assert.include(tests[0], 'app.test.ts');
		});

		it('should find tests in tests/unit', async () => {
			writeFile(path.join(tempDir, 'tests', 'unit', 'app.test.ts'));
			const pkg = new TestPackage({ path: tempDir });

			const tests = await pkg.getUnitTests();
			assert.lengthOf(tests, 1);
			assert.include(tests[0], 'app.test.ts');
		});

		it('should find tests in legacy test/ structure', async () => {
			writeFile(path.join(tempDir, 'test', 'app.test.ts'));
			const pkg = new TestPackage({ path: tempDir });

			const tests = await pkg.getUnitTests();
			assert.lengthOf(tests, 1);
			assert.include(tests[0], 'app.test.ts');
		});

		it('should find tests in legacy tests/ structure', async () => {
			writeFile(path.join(tempDir, 'tests', 'app.test.ts'));
			const pkg = new TestPackage({ path: tempDir });

			const tests = await pkg.getUnitTests();
			assert.lengthOf(tests, 1);
			assert.include(tests[0], 'app.test.ts');
		});

		it('should exclude e2e directory in legacy test/ structure', async () => {
			writeFile(path.join(tempDir, 'test', 'app.test.ts'));
			writeFile(path.join(tempDir, 'test', 'e2e', 'app.test.ts'));
			const pkg = new TestPackage({ path: tempDir });

			const tests = await pkg.getUnitTests();
			assert.lengthOf(tests, 1);
			assert.notInclude(tests[0], 'e2e');
		});

		it('should not exclude e2e when unit directory exists', async () => {
			writeFile(path.join(tempDir, 'test', 'unit', 'app.test.ts'));
			const pkg = new TestPackage({ path: tempDir });

			const tests = await pkg.getUnitTests();
			assert.lengthOf(tests, 1);
		});
	});

	describe('getEndToEndTests', () => {
		it('should find tests in test/e2e', async () => {
			writeFile(path.join(tempDir, 'test', 'e2e', 'app.spec.ts'));
			const pkg = new TestPackage({ path: tempDir });

			const tests = await pkg.getEndToEndTests();
			assert.lengthOf(tests, 1);
			assert.include(tests[0], 'app.spec.ts');
		});

		it('should find tests in tests/e2e', async () => {
			writeFile(path.join(tempDir, 'tests', 'e2e', 'app.spec.ts'));
			const pkg = new TestPackage({ path: tempDir });

			const tests = await pkg.getEndToEndTests();
			assert.lengthOf(tests, 1);
			assert.include(tests[0], 'app.spec.ts');
		});
	});
});
