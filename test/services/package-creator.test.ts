import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { PackageCreator } from '../../src/modules/services/package-creator';
import { Environment } from '../../src/environment/environment';

describe('PackageCreator', () => {
	let sandbox: sinon.SinonSandbox;
	let tmpDir: string;
	let templateDir: string;
	let projectDir: string;

	beforeEach(async () => {
		sandbox = sinon.createSandbox();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-creator-'));
		templateDir = path.join(tmpDir, 'templates');
		projectDir = path.join(tmpDir, 'project');
		await fs.mkdir(templateDir, { recursive: true });
		await fs.mkdir(projectDir, { recursive: true });

		// Stub Environment to return our test project dir
		sandbox.stub(Environment, 'getType').returns('project');
		sandbox.stub(Environment, 'getRoot').returns(projectDir);

		await fs.writeFile(path.join(templateDir, 'bundle.config.js.txt'), 'module.exports = { input: "{{inputPath}}", output: { js: "{{outputPath}}" } };');
		await fs.writeFile(path.join(templateDir, 'bundle.config.ts.txt'), 'export default { input: "{{inputPath}}", output: { js: "{{outputPath}}" } };');
		await fs.writeFile(path.join(templateDir, 'config.php.txt'), "<?php\nreturn ['js' => '{{jsPath}}', 'css' => '{{cssPath}}'];");
		await fs.writeFile(path.join(templateDir, 'input.js.txt'), 'export class {{name}} {}');
		await fs.writeFile(path.join(templateDir, 'unit.test.ts.txt'), 'describe("{{name}}", () => {});');
		await fs.writeFile(path.join(templateDir, 'e2e.spec.ts.txt'), 'test("{{name}}", async () => {});');
	});

	afterEach(async () => {
		sandbox.restore();
		await fs.rm(tmpDir, { recursive: true });
	});

	describe('create', () => {
		it('should create extension files for JS mode', async () => {
			// Create the expected directory structure for 'project' environment
			const localJsDir = path.join(projectDir, 'local', 'js');
			await fs.mkdir(localJsDir, { recursive: true });

			const creator = new PackageCreator(templateDir);
			const result = await creator.create({
				extensionName: 'ui.widget',
				tech: 'js',
			});

			assert.isString(result.packagePath);
			assert.isFalse(result.aliasesUpdated);
			assert.isAbove(result.files.length, 0);

			const fileNames = result.files.map((f) => f.relativePath);
			assert.include(fileNames, 'bundle.config.js');
			assert.include(fileNames, 'config.php');

			const hasSrcFile = fileNames.some((f) => f.startsWith('src/'));
			assert.isTrue(hasSrcFile, 'Should create source file');

			const hasTestFile = fileNames.some((f) => f.startsWith('tests/'));
			assert.isTrue(hasTestFile, 'Should create test files');

			// Verify files actually exist on disk
			for (const file of result.files)
			{
				const content = await fs.readFile(file.absolutePath, 'utf-8');
				assert.isString(content);
				assert.isAbove(content.length, 0);
			}
		});

		it('should create extension files for TS mode', async () => {
			const localJsDir = path.join(projectDir, 'local', 'js');
			await fs.mkdir(localJsDir, { recursive: true });

			const creator = new PackageCreator(templateDir);
			const result = await creator.create({
				extensionName: 'ui.widget',
				tech: 'ts',
			});

			const fileNames = result.files.map((f) => f.relativePath);
			assert.include(fileNames, 'bundle.config.ts');

			const srcFile = fileNames.find((f) => f.startsWith('src/'));
			assert.isTrue(srcFile?.endsWith('.ts'), 'Source file should have .ts extension');
		});

		it('should update aliases.tsconfig.json for TS mode', async () => {
			const localJsDir = path.join(projectDir, 'local', 'js');
			await fs.mkdir(localJsDir, { recursive: true });

			const aliasesPath = path.join(projectDir, 'aliases.tsconfig.json');
			await fs.writeFile(aliasesPath, JSON.stringify({
				compilerOptions: {
					baseUrl: projectDir,
					paths: {},
				},
			}));

			const creator = new PackageCreator(templateDir);
			const result = await creator.create({
				extensionName: 'ui.widget',
				tech: 'ts',
			});

			assert.isTrue(result.aliasesUpdated);

			const aliases = JSON.parse(await fs.readFile(aliasesPath, 'utf-8'));
			assert.property(aliases.compilerOptions.paths, 'ui.widget');
		});

		it('should not update aliases for JS mode', async () => {
			const localJsDir = path.join(projectDir, 'local', 'js');
			await fs.mkdir(localJsDir, { recursive: true });

			const creator = new PackageCreator(templateDir);
			const result = await creator.create({
				extensionName: 'ui.widget',
				tech: 'js',
			});

			assert.isFalse(result.aliasesUpdated);
		});

		it('should render templates with correct class name', async () => {
			const localJsDir = path.join(projectDir, 'local', 'js');
			await fs.mkdir(localJsDir, { recursive: true });

			const creator = new PackageCreator(templateDir);
			const result = await creator.create({
				extensionName: 'ui.my-component',
				tech: 'js',
			});

			const srcFile = result.files.find((f) => f.relativePath.startsWith('src/'));
			const content = await fs.readFile(srcFile.absolutePath, 'utf-8');
			// toPascalCase splits by non-word chars, so 'my-component' → 'MyComponent'
			assert.include(content, 'MyComponent');
		});
	});

	describe('resolvePackagePath', () => {
		it('should resolve extension name to a path', () => {
			const creator = new PackageCreator(templateDir);
			const result = creator.resolvePackagePath('ui.buttons');

			assert.isString(result);
			assert.include(result, 'ui');
			assert.include(result, 'buttons');
		});
	});
});
