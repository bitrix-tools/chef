import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { safeFileWrite, SaveFileStatus } from '../../src/utils/safe-file-write';

describe('safeFileWrite', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-safe-write-'));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	it('should create new file and return CREATED status', async () => {
		const filePath = path.join(tmpDir, 'new-file.txt');

		const status = await safeFileWrite({
			filePath,
			data: 'hello world',
		});

		assert.equal(status, SaveFileStatus.CREATED);

		const content = await fs.readFile(filePath, 'utf-8');
		assert.equal(content, 'hello world');
	});

	it('should overwrite existing file when confirmed and return REPLACED status', async () => {
		const filePath = path.join(tmpDir, 'existing.txt');
		await fs.writeFile(filePath, 'old content');

		const status = await safeFileWrite({
			filePath,
			data: 'new content',
			onConfirm: async () => true,
		});

		assert.equal(status, SaveFileStatus.REPLACED);

		const content = await fs.readFile(filePath, 'utf-8');
		assert.equal(content, 'new content');
	});

	it('should keep existing file when declined and return CANCELLED status', async () => {
		const filePath = path.join(tmpDir, 'existing.txt');
		await fs.writeFile(filePath, 'old content');

		const status = await safeFileWrite({
			filePath,
			data: 'new content',
			onConfirm: async () => false,
		});

		assert.equal(status, SaveFileStatus.CANCELLED);

		const content = await fs.readFile(filePath, 'utf-8');
		assert.equal(content, 'old content');
	});

	it('should pass filename to onConfirm callback', async () => {
		const filePath = path.join(tmpDir, 'test-file.txt');
		await fs.writeFile(filePath, 'content');

		let receivedFilename: string | undefined;

		await safeFileWrite({
			filePath,
			data: 'new content',
			onConfirm: async (filename) => {
				receivedFilename = filename;
				return false;
			},
		});

		assert.equal(receivedFilename, 'test-file.txt');
	});
});
