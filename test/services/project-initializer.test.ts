import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProjectInitializer, SaveFileStatus } from '../../src/modules/services/project-initializer';

describe('ProjectInitializer', () => {
	let tmpDir: string;
	let templateDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-init-'));
		templateDir = path.join(tmpDir, 'templates');
		await fs.mkdir(templateDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	describe('initTests', () => {
		it('should create playwright.config.ts and .env.test', async () => {
			const projectDir = path.join(tmpDir, 'project');
			await fs.mkdir(projectDir, { recursive: true });

			await fs.writeFile(
				path.join(templateDir, 'playwright.config.ts.txt'),
				'export default { testDir: "./test" };',
			);
			await fs.writeFile(
				path.join(templateDir, '.env.test.txt'),
				'TEST_URL=http://localhost',
			);

			const initializer = new ProjectInitializer({
				rootPath: projectDir,
				templateDirectory: templateDir,
			});

			const result = await initializer.initTests();

			assert.equal(result.files.length, 2);
			assert.equal(result.files[0].name, 'playwright.config.ts');
			assert.equal(result.files[0].status, SaveFileStatus.CREATED);
			assert.equal(result.files[1].name, '.env.test');
			assert.equal(result.files[1].status, SaveFileStatus.CREATED);

			const playwrightConfig = await fs.readFile(
				path.join(projectDir, 'playwright.config.ts'),
				'utf-8',
			);
			assert.equal(playwrightConfig, 'export default { testDir: "./test" };');

			const envTest = await fs.readFile(
				path.join(projectDir, '.env.test'),
				'utf-8',
			);
			assert.equal(envTest, 'TEST_URL=http://localhost');
		});
	});
});
