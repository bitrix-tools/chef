import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { installHgHooks } from '../../src/commands/init/hooks/install-hooks';
import { SaveFileStatus } from '../../src/utils/safe-file-write';

const autoConfirm = async () => true;

describe('installHgHooks', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-hooks-'));
		await fs.mkdir(path.join(tmpDir, '.hg'), { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	it('should create hook script file', async () => {
		await installHgHooks(tmpDir);

		const scriptPath = path.join(tmpDir, '.chef', 'hooks', 'update-aliases.sh');
		const content = await fs.readFile(scriptPath, 'utf8');

		assert.include(content, '#!/bin/sh');
		assert.include(content, 'chef aliases');
	});

	it('should return created status for new files', async () => {
		const result = await installHgHooks(tmpDir);

		assert.lengthOf(result.files, 1);
		assert.equal(result.files[0].name, '.chef/hooks/update-aliases.sh');
		assert.equal(result.files[0].status, SaveFileStatus.CREATED);
	});

	it('should add [hooks] section to empty hgrc', async () => {
		await fs.writeFile(path.join(tmpDir, '.hg', 'hgrc'), '');

		await installHgHooks(tmpDir);

		const content = await fs.readFile(path.join(tmpDir, '.hg', 'hgrc'), 'utf8');
		assert.include(content, '[hooks]');
		assert.include(content, 'update.chef = .chef/hooks/update-aliases.sh');
		assert.include(content, 'changegroup.chef = .chef/hooks/update-aliases.sh');
	});

	it('should add hooks to existing hgrc with other sections', async () => {
		await fs.writeFile(path.join(tmpDir, '.hg', 'hgrc'), '[ui]\nusername = Test\n');

		await installHgHooks(tmpDir);

		const content = await fs.readFile(path.join(tmpDir, '.hg', 'hgrc'), 'utf8');
		assert.include(content, '[ui]');
		assert.include(content, '[hooks]');
		assert.include(content, 'update.chef');
	});

	it('should append to existing [hooks] section', async () => {
		await fs.writeFile(
			path.join(tmpDir, '.hg', 'hgrc'),
			'[hooks]\nprecommit.lint = eslint .\n',
		);

		await installHgHooks(tmpDir);

		const content = await fs.readFile(path.join(tmpDir, '.hg', 'hgrc'), 'utf8');
		assert.include(content, 'precommit.lint = eslint .');
		assert.include(content, 'update.chef = .chef/hooks/update-aliases.sh');
	});

	it('should be idempotent — no duplicate hooks', async () => {
		await installHgHooks(tmpDir, { onConfirm: autoConfirm });
		await installHgHooks(tmpDir, { onConfirm: autoConfirm });

		const content = await fs.readFile(path.join(tmpDir, '.hg', 'hgrc'), 'utf8');
		const matches = content.match(/update\.chef/g);
		assert.lengthOf(matches, 1);
	});

	it('should create hgrc when it does not exist', async () => {
		const result = await installHgHooks(tmpDir);

		assert.isAbove(result.files.length, 0);

		const content = await fs.readFile(path.join(tmpDir, '.hg', 'hgrc'), 'utf8');
		assert.include(content, '[hooks]');
	});

	it('should not affect sections after [hooks]', async () => {
		await fs.writeFile(
			path.join(tmpDir, '.hg', 'hgrc'),
			'[hooks]\nprecommit.lint = eslint .\n\n[paths]\ndefault = https://example.com\n',
		);

		await installHgHooks(tmpDir);

		const content = await fs.readFile(path.join(tmpDir, '.hg', 'hgrc'), 'utf8');
		assert.include(content, '[paths]');
		assert.include(content, 'default = https://example.com');
	});
});
