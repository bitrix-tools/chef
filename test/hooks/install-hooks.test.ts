import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { hasGitRepo, installGitHooks } from '../../src/commands/init/hooks/install-hooks';
import { SaveFileStatus } from '../../src/utils/safe-file-write';

const execFile = promisify(execFileCb);

describe('hasGitRepo', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-hooks-'));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	it('should return true when .git directory exists', async () => {
		await fs.mkdir(path.join(tmpDir, '.git'), { recursive: true });

		assert.isTrue(await hasGitRepo(tmpDir));
	});

	it('should return false when there is no .git directory', async () => {
		assert.isFalse(await hasGitRepo(tmpDir));
	});
});

describe('installGitHooks', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-hooks-'));
		// A real repo is needed because installGitHooks runs `git config core.hooksPath`.
		await execFile('git', ['init'], { cwd: tmpDir });
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	it('should create the git hook scripts', async () => {
		const result = await installGitHooks(tmpDir);

		const names = result.files.map((file) => file.name);
		assert.includeMembers(names, [
			'.chef/hooks/post-merge',
			'.chef/hooks/post-checkout',
			'.chef/hooks/post-rewrite',
		]);

		const postMerge = await fs.readFile(
			path.join(tmpDir, '.chef', 'hooks', 'post-merge'),
			'utf8',
		);
		assert.include(postMerge, 'chef aliases');
	});

	it('should return created status for new files', async () => {
		const result = await installGitHooks(tmpDir);

		assert.lengthOf(result.files, 3);
		for (const file of result.files)
		{
			assert.equal(file.status, SaveFileStatus.CREATED);
		}
	});

	it('should set core.hooksPath to .chef/hooks', async () => {
		await installGitHooks(tmpDir);

		const config = await fs.readFile(path.join(tmpDir, '.git', 'config'), 'utf8');
		assert.include(config, '.chef/hooks');
	});
});
