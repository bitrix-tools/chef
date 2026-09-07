import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import {
	DEFAULT_MOCHA_WRAPPER,
	findEnvTestFile,
	readEnvTestFile,
	resolveMochaWrapper,
} from '../../../src/modules/engines/test/env-test-file';

describe('env-test-file', () => {
	let tmpDir: string;
	let packageDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-env-test-'));
		packageDir = path.join(tmpDir, 'ui', 'install', 'js', 'ui', 'buttons');
		fs.mkdirSync(packageDir, { recursive: true });

		delete process.env.MOCHA_WRAPPER;
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		delete process.env.MOCHA_WRAPPER;
	});

	function writePlaywrightConfig(fileName = 'playwright.config.ts'): void
	{
		fs.writeFileSync(path.join(tmpDir, fileName), 'export default {};');
	}

	function writeEnvTest(content: string): void
	{
		fs.writeFileSync(path.join(tmpDir, '.env.test'), content);
	}

	describe('findEnvTestFile', () => {
		it('should return null when no Playwright config exists', () => {
			assert.isNull(findEnvTestFile(packageDir, tmpDir));
		});

		it('should resolve next to playwright.config.ts', () => {
			writePlaywrightConfig();

			assert.equal(findEnvTestFile(packageDir, tmpDir), path.join(tmpDir, '.env.test'));
		});

		it('should resolve next to playwright.config.js as fallback', () => {
			writePlaywrightConfig('playwright.config.js');

			assert.equal(findEnvTestFile(packageDir, tmpDir), path.join(tmpDir, '.env.test'));
		});

		it('should return the path even when the file does not exist yet', () => {
			writePlaywrightConfig();

			const result = findEnvTestFile(packageDir, tmpDir);

			assert.isNotNull(result);
			assert.isFalse(fs.existsSync(result as string));
		});
	});

	describe('readEnvTestFile', () => {
		it('should parse variables and skip comments and blank lines', () => {
			writeEnvTest([
				'# a comment',
				'',
				'BASE_URL = http://bitrix24.io ',
				'LOGIN=admin',
				'MOCHA_WRAPPER=/dev/ui/cli/mocha-wrapper.php',
			].join('\n'));

			const variables = readEnvTestFile(path.join(tmpDir, '.env.test'));

			assert.deepEqual(variables, {
				BASE_URL: 'http://bitrix24.io',
				LOGIN: 'admin',
				MOCHA_WRAPPER: '/dev/ui/cli/mocha-wrapper.php',
			});
		});

		it('should parse names containing digits', () => {
			writeEnvTest('LOGIN_ADMIN2=admin2');

			assert.equal(readEnvTestFile(path.join(tmpDir, '.env.test')).LOGIN_ADMIN2, 'admin2');
		});

		it('should return an empty object for a missing file', () => {
			assert.deepEqual(readEnvTestFile(path.join(tmpDir, '.env.test')), {});
		});
	});

	describe('resolveMochaWrapper', () => {
		it('should fall back to the default when no .env.test exists', () => {
			writePlaywrightConfig();

			assert.equal(resolveMochaWrapper(packageDir, tmpDir), DEFAULT_MOCHA_WRAPPER);
		});

		it('should fall back to the default when no Playwright config exists', () => {
			assert.equal(resolveMochaWrapper(packageDir, tmpDir), DEFAULT_MOCHA_WRAPPER);
		});

		it('should read the override from .env.test', () => {
			writePlaywrightConfig();
			writeEnvTest('BASE_URL=http://bitrix24.io\nMOCHA_WRAPPER=/custom/runner.php');

			assert.equal(resolveMochaWrapper(packageDir, tmpDir), '/custom/runner.php');
		});

		it('should accept a full URL as the override', () => {
			writePlaywrightConfig();
			writeEnvTest('MOCHA_WRAPPER=http://runner.local/mocha.php');

			assert.equal(resolveMochaWrapper(packageDir, tmpDir), 'http://runner.local/mocha.php');
		});

		it('should fall back to the default when the override is empty', () => {
			writePlaywrightConfig();
			writeEnvTest('MOCHA_WRAPPER=');

			assert.equal(resolveMochaWrapper(packageDir, tmpDir), DEFAULT_MOCHA_WRAPPER);
		});

		it('should prefer the environment variable over .env.test', () => {
			writePlaywrightConfig();
			writeEnvTest('MOCHA_WRAPPER=/from-file.php');
			process.env.MOCHA_WRAPPER = '/from-env.php';

			assert.equal(resolveMochaWrapper(packageDir, tmpDir), '/from-env.php');
		});
	});
});
