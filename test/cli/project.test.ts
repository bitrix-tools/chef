import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

import { describe, it, beforeEach, afterEach } from 'mocha';

import { assert } from 'chai';

import { runChef, projectRepo } from './run-chef';

function createTmpProject(): string
{
	const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-project-')));
	fs.cpSync(projectRepo, tmp, { recursive: true });
	return tmp;
}

describe('chef (project environment)', () => {
	let tmpProject: string;

	beforeEach(() => {
		tmpProject = createTmpProject();
	});

	afterEach(() => {
		fs.rmSync(tmpProject, { recursive: true, force: true });
	});

	describe('build', () => {
		it('should build JS extension by name', async () => {
			const extensionDist = path.join(tmpProject, 'local/js/local/buttons/dist');
			fs.rmSync(extensionDist, { recursive: true, force: true });

			const { exitCode } = await runChef(['build', 'local.buttons'], { cwd: tmpProject });

			assert.equal(exitCode, 0);
			assert.isTrue(fs.existsSync(path.join(extensionDist, 'buttons.bundle.js')));
		});

		it('should build by --path in local/js', async () => {
			const extensionDist = path.join(tmpProject, 'local/js/local/buttons/dist');
			fs.rmSync(extensionDist, { recursive: true, force: true });

			const { exitCode } = await runChef(
				['build', '--path', 'local/js/local/buttons'],
				{ cwd: tmpProject },
			);

			assert.equal(exitCode, 0);
			assert.isTrue(fs.existsSync(path.join(extensionDist, 'buttons.bundle.js')));
		});

		it('should build TS extension by name', async () => {
			const extensionDist = path.join(tmpProject, 'local/js/local/ts-ext/dist');
			fs.rmSync(extensionDist, { recursive: true, force: true });

			const { exitCode } = await runChef(['build', 'local.ts-ext'], { cwd: tmpProject });

			assert.equal(exitCode, 0);
			assert.isTrue(fs.existsSync(path.join(extensionDist, 'ts-ext.bundle.js')));
		});

		it('should report not found for non-existent extension', async () => {
			const { output } = await runChef(['build', 'local.nope'], { cwd: tmpProject });

			assert.include(output, 'not found');
		});
	});

	describe('create', () => {
		it('should create extension in local/js', async () => {
			const { exitCode } = await runChef(
				['create', 'local.new-ext'],
				{ cwd: tmpProject },
			);

			assert.equal(exitCode, 0);

			const extPath = path.join(tmpProject, 'local/js/local/new-ext');
			assert.isTrue(fs.existsSync(path.join(extPath, 'bundle.config.ts')));
			assert.isTrue(fs.existsSync(path.join(extPath, 'src')));
		});
	});

	describe('aliases', () => {
		it('should generate aliases from project extensions', async () => {
			const { exitCode, output } = await runChef(
				['aliases'],
				{ cwd: tmpProject },
			);

			assert.equal(exitCode, 0);
			assert.isTrue(fs.existsSync(path.join(tmpProject, 'aliases.tsconfig.json')));

			const aliases = JSON.parse(
				fs.readFileSync(path.join(tmpProject, 'aliases.tsconfig.json'), 'utf-8'),
			);
			const paths = aliases.compilerOptions?.paths ?? {};
			assert.property(paths, 'local.buttons');
		});
	});

	describe('init', () => {
		it('should init build in project', async () => {
			fs.rmSync(path.join(tmpProject, 'tsconfig.json'), { force: true });

			const { exitCode } = await runChef(['init', 'build'], { cwd: tmpProject });

			assert.equal(exitCode, 0);
			assert.isTrue(fs.existsSync(path.join(tmpProject, 'tsconfig.json')));
			assert.isTrue(fs.existsSync(path.join(tmpProject, '.browserslistrc')));
		});

		it('should init tests in project', async () => {
			const { exitCode } = await runChef(
				['init', 'tests', '--force'],
				{ cwd: tmpProject },
			);

			assert.equal(exitCode, 0);
			assert.isTrue(fs.existsSync(path.join(tmpProject, 'playwright.config.ts')));
		});

		it('should init hooks in project with git', async () => {
			execSync('git init', { cwd: tmpProject, stdio: 'ignore' });

			const { exitCode } = await runChef(['init', 'hooks'], { cwd: tmpProject });

			assert.equal(exitCode, 0);
			assert.isTrue(fs.existsSync(path.join(tmpProject, '.chef', 'hooks')));
		});
	});

	describe('diag', () => {
		it('should run top-used on project extensions', async () => {
			const { exitCode, output } = await runChef(
				['diag', 'top-used', '--limit', '3'],
				{ cwd: tmpProject },
			);

			assert.equal(exitCode, 0);
			assert.include(output, 'local.buttons');
		});

		it('should find unused extensions in project', async () => {
			const { exitCode, output } = await runChef(
				['diag', 'unused'],
				{ cwd: tmpProject },
			);

			assert.equal(exitCode, 0);
			// local.forms is used by nobody outside
			assert.match(output, /local\.\w+/);
		});
	});

	describe('lint', () => {
		it('should skip lint when no eslint config in project', async () => {
			const { exitCode, output } = await runChef(
				['lint', 'local.buttons'],
				{ cwd: tmpProject },
			);

			assert.equal(exitCode, 0);
			assert.include(output, 'No matching lint strategy');
		});
	});
});
