import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { fileExistsAsync } from '../../src/utils/file-exists-async';

describe('fileExistsAsync', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-file-exists-'));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	it('should return true for existing file', async () => {
		const filePath = path.join(tmpDir, 'exists.txt');
		await fs.writeFile(filePath, 'content');

		assert.isTrue(await fileExistsAsync(filePath));
	});

	it('should return false for non-existing file', async () => {
		const filePath = path.join(tmpDir, 'missing.txt');

		assert.isFalse(await fileExistsAsync(filePath));
	});

	it('should return true for existing directory', async () => {
		assert.isTrue(await fileExistsAsync(tmpDir));
	});
});
