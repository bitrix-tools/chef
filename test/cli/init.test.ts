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

	describe('init agents', () => {
		it('should write agent instructions to AGENTS.md', async () => {
			const { exitCode, output } = await runChef(
				['init', 'agents'],
				{ cwd: tmpProject },
			);

			assert.equal(exitCode, 0);
			assert.include(output, 'AGENTS.md — created');
			assert.include(fs.readFileSync(path.join(tmpProject, 'AGENTS.md'), 'utf-8'), 'chef help agent');
		});

		it('should fail outside a Bitrix project', async () => {
			const tmpDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-init-')));

			try
			{
				const { exitCode, output } = await runChef(
					['init', 'agents'],
					{ cwd: tmpDirectory },
				);

				assert.equal(exitCode, 1);
				assert.include(output, 'CF5004');
				assert.isFalse(fs.existsSync(path.join(tmpDirectory, 'AGENTS.md')));
			}
			finally
			{
				fs.rmSync(tmpDirectory, { recursive: true, force: true });
			}
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
