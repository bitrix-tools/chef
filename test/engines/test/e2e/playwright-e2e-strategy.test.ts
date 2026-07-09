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

	// chef's own node_modules — linked into the temp project so specs that import
	// '@playwright/test' can resolve it (only needed by tests that actually compile a spec).
	const chefNodeModules = path.resolve(import.meta.dirname, '../../../../node_modules');

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-e2e-'));
		testsDir = path.join(tmpDir, 'tests');
		fs.mkdirSync(testsDir, { recursive: true });
		fs.symlinkSync(chefNodeModules, path.join(tmpDir, 'node_modules'), 'dir');
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

	function writePassingSpecWithLog(): void
	{
		fs.writeFileSync(
			path.join(tmpDir, 'playwright.config.ts'),
			"export default { testDir: './tests', projects: [{ name: 'chromium', use: { defaultBrowserType: 'chromium' } }] };",
		);
		fs.writeFileSync(
			path.join(testsDir, 'log.spec.ts'),
			"import { test, expect } from '@playwright/test';\n"
			+ "test('logs', async () => { console.log('CHEF_NODE_MARKER value'); expect(1).toBe(1); });",
		);
	}

	it('captures the spec Node stdout when captureNodeOutput is set', async () => {
		writePassingSpecWithLog();

		const result = await new PlaywrightE2EStrategy().run({ ...options(), project: 'chromium', captureNodeOutput: true });

		assert.isEmpty(result.errors);
		assert.isArray(result.nodeOutput);
		const messages = (result.nodeOutput ?? []).flatMap((section) => section.messages);
		assert.isTrue(
			messages.some((message) => message.includes('CHEF_NODE_MARKER')),
			'console.log from the spec must be captured',
		);
	});

	it('does not collect Node stdout when captureNodeOutput is not set', async () => {
		writePassingSpecWithLog();

		const result = await new PlaywrightE2EStrategy().run({ ...options(), project: 'chromium' });

		assert.isEmpty(result.errors);
		assert.isUndefined(result.nodeOutput, 'without the flag nodeOutput must stay unset');
	});

	it('matches a grep pattern pasted in NFD against an NFC test title (normalizes to NFC)', async () => {
		fs.writeFileSync(
			path.join(tmpDir, 'playwright.config.ts'),
			"export default { testDir: './tests', projects: [{ name: 'chromium', use: { defaultBrowserType: 'chromium' } }] };",
		);
		// Title with "й" written in NFC (the normal on-disk form).
		fs.writeFileSync(
			path.join(testsDir, 'ru.spec.ts'),
			"import { test, expect } from '@playwright/test';\n"
			+ "test('русский тест', async () => { expect(1).toBe(1); });",
		);

		// Same word decomposed to NFD, as it arrives from a macOS paste. Without the
		// strategy normalizing to NFC, this would match nothing and report zero tests.
		const grep = 'русский'.normalize('NFD');
		assert.notEqual(grep, 'русский', 'NFD form must differ byte-wise from NFC');

		const result = await new PlaywrightE2EStrategy().run({ ...options(), project: 'chromium', grep });

		assert.isEmpty(result.errors);
		const passed = result.report.filter((token) => token.id === 'TEST_PASSED');
		assert.lengthOf(passed, 1, 'the NFD pattern must match the NFC title after normalization');
	});

	it('lists tests without running them when listOnly is set', async () => {
		fs.writeFileSync(
			path.join(tmpDir, 'playwright.config.ts'),
			"export default { testDir: './tests', projects: [{ name: 'chromium', use: { defaultBrowserType: 'chromium' } }] };",
		);
		fs.writeFileSync(
			path.join(testsDir, 'list.spec.ts'),
			"import { test, expect } from '@playwright/test';\n"
			+ "test.describe('Группа', () => {\n"
			+ "  test('первый', async () => { expect(1).toBe(2); });\n"  // would FAIL if run
			+ "  test('второй', async () => { expect(1).toBe(1); });\n"
			+ '});',
		);

		const result = await new PlaywrightE2EStrategy().run({ ...options(), project: 'chromium', listOnly: true });

		assert.isEmpty(result.errors, 'listing must not error even if a test would fail when run');
		const listed = result.report.filter((token) => token.id === 'TEST_LISTED');
		assert.lengthOf(listed, 2, 'both tests are listed');
		// No run happened — the failing test is not reported as failed.
		assert.isEmpty(result.report.filter((token) => token.id === 'TEST_FAILED'));
		assert.deepEqual(listed.map((t) => t.title), ['первый', 'второй']);
		assert.deepEqual(listed[0].suite, ['Группа']);
	});
});
