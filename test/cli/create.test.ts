import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { runChef } from './run-chef';

function createTmpProject(): string
{
	const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-create-')));

	// Project environment indicators
	fs.mkdirSync(path.join(tmp, 'bitrix'));
	fs.writeFileSync(path.join(tmp, 'index.php'), '<?php');
	fs.writeFileSync(path.join(tmp, 'urlrewrite.php'), '<?php');
	fs.mkdirSync(path.join(tmp, 'local', 'js'), { recursive: true });

	return tmp;
}

describe('chef create', () => {
	let tmpProject: string;

	beforeEach(() => {
		tmpProject = createTmpProject();
	});

	afterEach(() => {
		fs.rmSync(tmpProject, { recursive: true, force: true });
	});

	it('should create a TypeScript extension', async () => {
		const { exitCode, output } = await runChef(
			['create', 'local.test-ext'],
			{ cwd: tmpProject },
		);

		assert.equal(exitCode, 0);
		assert.include(output, 'local.test-ext');

		const extPath = path.join(tmpProject, 'local/js/local/test-ext');
		assert.isTrue(fs.existsSync(path.join(extPath, 'bundle.config.js')));
		assert.isTrue(fs.existsSync(path.join(extPath, 'src')));
	});

	it('should create a JavaScript extension', async () => {
		const { exitCode } = await runChef(
			['create', 'local.js-ext', '--tech', 'js'],
			{ cwd: tmpProject },
		);

		assert.equal(exitCode, 0);

		const extPath = path.join(tmpProject, 'local/js/local/js-ext');
		assert.isTrue(fs.existsSync(path.join(extPath, 'bundle.config.js')));
	});

	it('should overwrite with --force', async () => {
		await runChef(
			['create', 'local.force-ext'],
			{ cwd: tmpProject },
		);

		const { exitCode } = await runChef(
			['create', 'local.force-ext', '--force'],
			{ cwd: tmpProject },
		);

		assert.equal(exitCode, 0);
	});
});
