import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { resolvePlaywright } from '../../../../../src/modules/engines/test/unit/playwright/resolve-playwright';

// Each fake package gets a __marker so a test can tell which copy was loaded. Only the
// members resolvePlaywright inspects are needed — it never launches anything.
function writeFakePlaywright(projectRoot: string, packageName: string, options: {
	marker: string;
	withLaunchers?: boolean;
}): void
{
	const packageDir = path.join(projectRoot, 'node_modules', ...packageName.split('/'));
	fs.mkdirSync(packageDir, { recursive: true });

	fs.writeFileSync(
		path.join(packageDir, 'package.json'),
		JSON.stringify({ name: packageName, version: '1.0.0', main: 'index.js' }),
	);

	const launchers = options.withLaunchers === false
		? ''
		: 'chromium: { executablePath: () => "/fake/chromium" }, firefox: {}, webkit: {},';

	fs.writeFileSync(
		path.join(packageDir, 'index.js'),
		`module.exports = { __marker: ${JSON.stringify(options.marker)}, ${launchers} };`,
	);
}

describe('resolvePlaywright', () => {
	let tmpDir: string;

	beforeEach(() => {
		// A fresh directory per test: import() caches by URL, so two tests reusing one path
		// would resolve to whichever fake package was written first.
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-resolve-playwright-'));
		fs.writeFileSync(
			path.join(tmpDir, 'package.json'),
			JSON.stringify({ name: 'fake-project', version: '1.0.0' }),
		);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('should load playwright from the project, not from chef', async () => {
		writeFakePlaywright(tmpDir, 'playwright', { marker: 'project-playwright' });

		const playwright = await resolvePlaywright(tmpDir);

		assert.equal((playwright as any).__marker, 'project-playwright');
		assert.equal(playwright.chromium?.executablePath(), '/fake/chromium');
	});

	it('should fall back to @playwright/test when the project declares only the runner', async () => {
		writeFakePlaywright(tmpDir, '@playwright/test', { marker: 'project-test-runner' });

		const playwright = await resolvePlaywright(tmpDir);

		assert.equal((playwright as any).__marker, 'project-test-runner');
	});

	it('should fall back to playwright-core when it is the only copy present', async () => {
		writeFakePlaywright(tmpDir, 'playwright-core', { marker: 'project-core' });

		const playwright = await resolvePlaywright(tmpDir);

		assert.equal((playwright as any).__marker, 'project-core');
	});

	it('should prefer playwright over the other candidates', async () => {
		writeFakePlaywright(tmpDir, 'playwright', { marker: 'project-playwright' });
		writeFakePlaywright(tmpDir, '@playwright/test', { marker: 'project-test-runner' });
		writeFakePlaywright(tmpDir, 'playwright-core', { marker: 'project-core' });

		const playwright = await resolvePlaywright(tmpDir);

		assert.equal((playwright as any).__marker, 'project-playwright');
	});

	it('should skip a candidate that exposes no launchers', async () => {
		writeFakePlaywright(tmpDir, 'playwright', { marker: 'stripped', withLaunchers: false });
		writeFakePlaywright(tmpDir, '@playwright/test', { marker: 'project-test-runner' });

		const playwright = await resolvePlaywright(tmpDir);

		assert.equal((playwright as any).__marker, 'project-test-runner');
	});

	it("should fall back to chef's own copy when the project declares none", async () => {
		const playwright = await resolvePlaywright(tmpDir);

		// chef's real Playwright — no marker, but it must be usable.
		assert.isUndefined((playwright as any).__marker);
		assert.isFunction(playwright.chromium?.launch);
	});
});
