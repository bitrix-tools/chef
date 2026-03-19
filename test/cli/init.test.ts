import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { runChef } from './run-chef';

function createTmpProject(): string
{
	const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-init-')));

	// Project environment indicators
	fs.mkdirSync(path.join(tmp, 'bitrix'));
	fs.writeFileSync(path.join(tmp, 'index.php'), '<?php');
	fs.writeFileSync(path.join(tmp, 'urlrewrite.php'), '<?php');
	fs.mkdirSync(path.join(tmp, 'local', 'js'), { recursive: true });

	return tmp;
}

describe('chef init', () => {
	let tmpProject: string;

	beforeEach(() => {
		tmpProject = createTmpProject();
	});

	afterEach(() => {
		fs.rmSync(tmpProject, { recursive: true, force: true });
	});

	describe('init build', () => {
		it('should create build config files', async () => {
			const { exitCode } = await runChef(
				['init', 'build'],
				{ cwd: tmpProject },
			);

			assert.equal(exitCode, 0);
			assert.isTrue(fs.existsSync(path.join(tmpProject, 'aliases.tsconfig.json')));
			assert.isTrue(fs.existsSync(path.join(tmpProject, 'tsconfig.json')));
			assert.isTrue(fs.existsSync(path.join(tmpProject, '.browserslistrc')));
		});
	});

	describe('init tests', () => {
		it('should create test config files', async () => {
			const { exitCode } = await runChef(
				['init', 'tests', '--force'],
				{ cwd: tmpProject },
			);

			assert.equal(exitCode, 0);
			assert.isTrue(fs.existsSync(path.join(tmpProject, 'playwright.config.ts')));
			assert.isTrue(fs.existsSync(path.join(tmpProject, '.env.test')));
		});
	});

	describe('init hooks', () => {
		it('should create hooks in a git repo', async () => {
			const tmpGitProject = createTmpProject();

			try
			{
				execSync('git init', { cwd: tmpGitProject, stdio: 'ignore' });

				const { exitCode } = await runChef(
					['init', 'hooks'],
					{ cwd: tmpGitProject },
				);

				assert.equal(exitCode, 0);
				assert.isTrue(fs.existsSync(path.join(tmpGitProject, '.chef', 'hooks')));
			}
			finally
			{
				fs.rmSync(tmpGitProject, { recursive: true, force: true });
			}
		});
	});
});
