import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { planUpdateCheck, formatUpdateLine } from '../../src/utils/update-notifier';

import type { UpdateCheckOptions } from '../../src/utils/update-notifier';

const DAY = 24 * 60 * 60 * 1000;

describe('update notifier', () => {
	let tmpDir: string;
	let cacheFile: string;
	const now = Date.now();

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-update-'));
		cacheFile = path.join(tmpDir, 'chef-update-check.json');
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true });
	});

	function writeCache(latestVersion: string, lastCheck: number = now): void
	{
		fs.writeFileSync(cacheFile, JSON.stringify({ lastCheck, latestVersion }));
	}

	function plan(options: UpdateCheckOptions = {}): ReturnType<typeof planUpdateCheck>
	{
		return planUpdateCheck({
			cacheFile,
			now,
			env: {},
			currentVersion: '2.4.0',
			isSourceCheckout: false,
			isTerminal: false,
			...options,
		});
	}

	describe('notice', () => {
		it('prints a single line without a terminal', () => {
			writeCache('2.5.0');

			assert.deepEqual(plan({ isTerminal: false })?.notice, {
				style: 'line',
				currentVersion: '2.4.0',
				latestVersion: '2.5.0',
			});
		});

		it('shows a box in a terminal', () => {
			writeCache('2.5.0');

			assert.equal(plan({ isTerminal: true })?.notice?.style, 'box');
		});

		it('is not shown when the cached version is not newer', () => {
			writeCache('2.4.0');
			assert.isNull(plan()?.notice);

			writeCache('2.3.9');
			assert.isNull(plan()?.notice);
		});

		it('compares versions by number, not as strings', () => {
			writeCache('2.10.0');
			assert.equal(plan({ currentVersion: '2.9.1' })?.notice?.latestVersion, '2.10.0');

			writeCache('2.9.1');
			assert.isNull(plan({ currentVersion: '2.10.0' })?.notice);
		});

		it('is not shown when the cache is broken', () => {
			fs.writeFileSync(cacheFile, '{"lastCheck":');
			assert.isNull(plan()?.notice);

			fs.writeFileSync(cacheFile, JSON.stringify({ lastCheck: now, latestVersion: 250 }));
			assert.isNull(plan()?.notice);
		});

		it('is not shown when there is no cache', () => {
			assert.isNull(plan()?.notice);
		});
	});

	describe('cache refresh', () => {
		it('refreshes a missing or broken cache', () => {
			assert.isTrue(plan()?.refreshCache);

			fs.writeFileSync(cacheFile, 'not json');
			assert.isTrue(plan()?.refreshCache);
		});

		it('refreshes the cache once a day', () => {
			writeCache('2.4.0', now - DAY / 2);
			assert.isFalse(plan()?.refreshCache);

			writeCache('2.4.0', now - DAY - 1);
			assert.isTrue(plan()?.refreshCache);
		});
	});

	describe('turned off', () => {
		beforeEach(() => {
			writeCache('2.5.0', now - 2 * DAY);
		});

		it('with NO_UPDATE_NOTIFIER', () => {
			assert.isNull(plan({ env: { NO_UPDATE_NOTIFIER: '1' } }));
			assert.isNull(plan({ env: { NO_UPDATE_NOTIFIER: '1' }, isTerminal: true }));
		});

		it('in CI', () => {
			assert.isNull(plan({ env: { CI: 'true' } }));
			assert.isNull(plan({ env: { CI: '1' } }));
		});

		it('not when CI is set to false', () => {
			assert.isNotNull(plan({ env: { CI: 'false' } }));
			assert.isNotNull(plan({ env: { CI: '0' } }));
		});

		it('when chef runs from its sources', () => {
			assert.isNull(plan({ isSourceCheckout: true }));
		});
	});

	describe('formatUpdateLine', () => {
		it('has a stable format', () => {
			assert.equal(
				formatUpdateLine('2.4.0', '2.5.0'),
				'chef: update available 2.4.0 → 2.5.0, run: npm i -g @bitrix/chef',
			);
		});
	});
});
