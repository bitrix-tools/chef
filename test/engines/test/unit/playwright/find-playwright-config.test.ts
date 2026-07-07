import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { findPlaywrightConfig } from '../../../../../src/modules/engines/test/unit/playwright/find-playwright-config';

describe('findPlaywrightConfig', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('should return null when no config exists', async () => {
		const packageDir = path.join(tmpDir, 'package');
		fs.mkdirSync(packageDir, { recursive: true });

		const result = await findPlaywrightConfig(packageDir, tmpDir);

		assert.isNull(result);
	});

	it('should find playwright.config.ts in project root', async () => {
		const packageDir = path.join(tmpDir, 'src', 'ui', 'buttons');
		fs.mkdirSync(packageDir, { recursive: true });

		fs.writeFileSync(
			path.join(tmpDir, 'playwright.config.ts'),
			'export default { use: { baseURL: "http://localhost:3000" } };',
		);

		const result = await findPlaywrightConfig(packageDir, tmpDir);

		assert.isNotNull(result);
		assert.equal(result?.use?.baseURL, 'http://localhost:3000');
	});

	it('should find playwright.config.js as fallback', async () => {
		const packageDir = path.join(tmpDir, 'package');
		fs.mkdirSync(packageDir, { recursive: true });

		fs.writeFileSync(
			path.join(tmpDir, 'playwright.config.js'),
			'module.exports = { use: { baseURL: "http://localhost:4000" } };',
		);

		const result = await findPlaywrightConfig(packageDir, tmpDir);

		assert.isNotNull(result);
		assert.equal(result?.use?.baseURL, 'http://localhost:4000');
	});

	it('should prefer .ts over .js when both exist', async () => {
		fs.writeFileSync(
			path.join(tmpDir, 'playwright.config.ts'),
			'export default { use: { baseURL: "http://ts" } };',
		);
		fs.writeFileSync(
			path.join(tmpDir, 'playwright.config.js'),
			'module.exports = { use: { baseURL: "http://js" } };',
		);

		const result = await findPlaywrightConfig(tmpDir, tmpDir);

		assert.isNotNull(result);
		assert.equal(result?.use?.baseURL, 'http://ts');
	});

	it('should throw (not return null) when the config exists but fails to load', async () => {
		const configPath = path.join(tmpDir, 'playwright.config.js');
		// A syntax error must surface as an error, not be swallowed into a config-less run.
		fs.writeFileSync(configPath, 'module.exports = { this is broken');

		let thrown: Error | null = null;
		try
		{
			await findPlaywrightConfig(tmpDir, tmpDir);
		}
		catch (error)
		{
			thrown = error as Error;
		}

		assert.isNotNull(thrown, 'a broken config should throw');
		assert.include(thrown!.message, configPath, 'error message should name the config path');
	});
});
