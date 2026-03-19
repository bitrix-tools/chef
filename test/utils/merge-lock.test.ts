import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { MergeLock } from '../../src/utils/merge-lock';

describe('MergeLock', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-merge-lock-'));
		await fs.mkdir(path.join(tmpDir, '.chef'), { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	it('should not be locked initially', async () => {
		const lock = new MergeLock(tmpDir);

		assert.isFalse(await lock.isLocked());
	});

	it('should be locked after acquire', async () => {
		const lock = new MergeLock(tmpDir);

		await lock.acquire();

		assert.isTrue(await lock.isLocked());
	});

	it('should not be locked after release', async () => {
		const lock = new MergeLock(tmpDir);

		await lock.acquire();
		await lock.release();

		assert.isFalse(await lock.isLocked());
	});

	it('should not throw when releasing without acquire', async () => {
		const lock = new MergeLock(tmpDir);

		await lock.release();

		assert.isFalse(await lock.isLocked());
	});

	it('should create .chef directory if missing', async () => {
		const freshDir = path.join(tmpDir, 'fresh');
		await fs.mkdir(freshDir);
		const lock = new MergeLock(freshDir);

		await lock.acquire();

		assert.isTrue(await lock.isLocked());
	});

	it('should write PID to lock file', async () => {
		const lock = new MergeLock(tmpDir);

		await lock.acquire();

		const content = await fs.readFile(lock.path, 'utf8');
		assert.equal(content, String(process.pid));
	});
});
