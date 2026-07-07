import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { PlaywrightUnitStrategy } from '../../../../../src/modules/engines/test/unit/playwright/playwright-unit-strategy';
import { CF } from '../../../../../src/diagnostics/diagnostic-codes';

import type { UnitTestOptions } from '../../../../../src/modules/engines/test/test-types';

// These cases return before a browser is launched, so they stay fast: the strategy
// validates the config (found, loadable, has a baseURL) up front and surfaces a clear
// error instead of failing later with a cryptic message or an empty "no tests" result.
describe('PlaywrightUnitStrategy config validation', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-unit-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function options(): UnitTestOptions
	{
		return {
			packageName: 'test.package',
			packageRoot: tmpDir,
			projectRoot: tmpDir,
			publicPath: '/',
			targets: [],
			typescript: false,
			testFiles: [path.join(tmpDir, 'test', 'app.test.js')],
		};
	}

	it('errors with PLAYWRIGHT_CONFIG_NOT_FOUND when there is no config', async () => {
		const result = await new PlaywrightUnitStrategy().run(options());

		assert.lengthOf(result.errors, 1);
		assert.equal((result.errors[0] as any).code, CF.PLAYWRIGHT_CONFIG_NOT_FOUND);
	});

	it('errors with BASE_URL_NOT_SET when the config has no baseURL', async () => {
		fs.writeFileSync(path.join(tmpDir, 'playwright.config.ts'), 'export default { use: {} };');

		const result = await new PlaywrightUnitStrategy().run(options());

		assert.lengthOf(result.errors, 1);
		assert.equal((result.errors[0] as any).code, CF.BASE_URL_NOT_SET);
		assert.include(result.errors[0].message, 'baseURL');
	});

	it('errors when the config exists but fails to load', async () => {
		fs.writeFileSync(path.join(tmpDir, 'playwright.config.ts'), 'export default { this is broken');

		const result = await new PlaywrightUnitStrategy().run(options());

		assert.lengthOf(result.errors, 1);
		assert.include(result.errors[0].message, 'Failed to load Playwright config');
	});
});
