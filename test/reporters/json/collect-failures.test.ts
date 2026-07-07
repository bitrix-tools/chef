import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { collectFailures, resolveUnitBrowsers } from '../../../src/reporters/json/test';
import { CF } from '../../../src/diagnostics/diagnostic-codes';

import type { TestKindDetails, TestOptions } from '../../../src/reporters/json/test';

function kind(overrides: Partial<TestKindDetails> = {}): TestKindDetails
{
	return {
		ran: true,
		durationMs: 0,
		browsers: [],
		passed: 0,
		failed: 0,
		skipped: 0,
		total: 0,
		tests: [],
		consoleLogs: [],
		runErrors: [],
		...overrides,
	};
}

describe('collectFailures', () => {
	it('includes run-level errors even when no individual test failed', () => {
		// The masked case: a broken config produced no tests, but the run failed. The
		// run error must still surface so --json does not serialize an empty success.
		const details = kind({
			runErrors: [{ code: CF.PLAYWRIGHT_ERROR, message: 'Failed to load Playwright config: broken' }],
		});

		const failures = collectFailures(details);

		assert.lengthOf(failures, 1);
		assert.equal(failures[0].code, CF.PLAYWRIGHT_ERROR);
		assert.include(failures[0].message, 'Failed to load Playwright config');
	});

	it('reports run errors before per-test failures', () => {
		const details = kind({
			runErrors: [{ code: CF.PLAYWRIGHT_ERROR, message: 'run blew up' }],
			failed: 1,
			total: 1,
			tests: [{
				suite: ['Suite'],
				title: 'a test',
				status: 'failed',
				results: {
					chromium: { status: 'failed', failure: { message: 'expected 1 to be 2' } },
				},
			}],
		});

		const failures = collectFailures(details);

		assert.lengthOf(failures, 2);
		assert.include(failures[0].message, 'run blew up', 'run error comes first');
		assert.include(failures[1].message, 'expected 1 to be 2');
	});

	it('returns nothing for a clean run', () => {
		const details = kind({
			passed: 2,
			total: 2,
			tests: [
				{ suite: [], title: 'ok 1', status: 'passed', results: { chromium: { status: 'passed' } } },
				{ suite: [], title: 'ok 2', status: 'passed', results: { chromium: { status: 'passed' } } },
			],
		});

		assert.isEmpty(collectFailures(details));
	});
});

describe('resolveUnitBrowsers', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-browsers-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function fakePackage()
	{
		return { getPath: () => tmpDir, getName: () => 'test.package' } as any;
	}

	it('falls back to default browsers when the config fails to load (does not throw)', async () => {
		// A broken config must not abort the whole --json run here; the strategy re-loads it
		// and surfaces the real error. resolveUnitBrowsers only needs a browser list.
		fs.writeFileSync(path.join(tmpDir, 'playwright.config.ts'), 'export default { this is broken');

		const browsers = await resolveUnitBrowsers(fakePackage(), {} as TestOptions);

		assert.deepEqual(browsers, ['chromium', 'firefox', 'webkit']);
	});
});
