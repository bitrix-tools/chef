import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { PlaywrightE2EStrategy } from '../../../../src/modules/engines/test/e2e/playwright/playwright-e2e-strategy';

import type { E2ETestOptions } from '../../../../src/modules/engines/test/test-types';

// These are integration tests: they spawn a real `npx playwright`. The point is that a
// failed run must surface an error to the user instead of an empty "no tests collected"
// result. The broken-config cases fail during config load, before any browser launches,
// so they stay fast and deterministic.
describe('PlaywrightE2EStrategy error surfacing', function () {
	// Integration tests spawn a real `npx playwright`; compiling a spec and launching a
	// project takes longer than Mocha's 2s default.
	this.timeout(60000);

	let tmpDir: string;
	let testsDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-e2e-'));
		testsDir = path.join(tmpDir, 'tests');
		fs.mkdirSync(testsDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function options(): E2ETestOptions
	{
		return {
			projectRoot: tmpDir,
			testsDirectory: testsDir,
			hasTests: true,
		};
	}

	it('returns an error (not an empty result) when the config has a syntax error', async () => {
		fs.writeFileSync(path.join(tmpDir, 'playwright.config.ts'), 'export default { this is broken');

		const result = await new PlaywrightE2EStrategy().run(options());

		assert.isNotEmpty(result.errors, 'a broken config must produce an error');
		assert.isEmpty(result.report);
		// The run error must not carry a JS stack: it would point at chef's own source
		// (where the ChefError is constructed) and make the reporter's code-frame highlight
		// the wrong file. The real cause lives in the message.
		assert.isUndefined(result.errors[0].stack, 'run error must not carry a misleading stack');
	});

	it('returns an error when the config imports a missing module', async () => {
		fs.writeFileSync(
			path.join(tmpDir, 'playwright.config.ts'),
			'import missing from "./does-not-exist";\nexport default missing;',
		);

		const result = await new PlaywrightE2EStrategy().run(options());

		assert.isNotEmpty(result.errors, 'an unloadable config must produce an error');
	});

	it('surfaces the real reason when a spec fails to compile', async () => {
		fs.writeFileSync(
			path.join(tmpDir, 'playwright.config.ts'),
			"export default { testDir: './tests', projects: [{ name: 'chromium', use: { defaultBrowserType: 'chromium' } }] };",
		);
		fs.writeFileSync(
			path.join(testsDir, 'broken.spec.ts'),
			"import { thing } from './missing-module';\nimport { test } from '@playwright/test';\ntest('x', () => { void thing; });",
		);

		const result = await new PlaywrightE2EStrategy().run({ ...options(), project: 'chromium' });

		assert.isNotEmpty(result.errors, 'a spec that cannot compile must produce an error');
		// The message must carry the actual cause, not just a bare exit code — Playwright
		// routes compile errors through the reporter's onError with a custom reporter.
		assert.include(result.errors[0].message, 'missing-module');
	});

	it('does not run Playwright at all when there are no test files', async () => {
		const result = await new PlaywrightE2EStrategy().run({ ...options(), hasTests: false });

		// hasTests:false is the legitimate empty case — no error, no report.
		assert.isEmpty(result.errors);
		assert.isEmpty(result.report);
	});
});
