import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { AliasGenerator } from '../../src/modules/services/alias-generator';
import { Environment } from '../../src/environment/environment';

describe('AliasGenerator', () => {
	let tmpDir: string;
	let sandbox: sinon.SinonSandbox;

	beforeEach(async () => {
		sandbox = sinon.createSandbox();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-alias-gen-'));

		sandbox.stub(Environment, 'getType').returns('project');
		sandbox.stub(Environment, 'getRoot').returns(tmpDir);
	});

	afterEach(async () => {
		sandbox.restore();
		await fs.rm(tmpDir, { recursive: true });
	});

	describe('addAlias', () => {
		it('should add alias to existing file', async () => {
			const aliasesPath = path.join(tmpDir, 'aliases.tsconfig.json');
			await fs.writeFile(aliasesPath, JSON.stringify({
				compilerOptions: {
					baseUrl: tmpDir,
					paths: {},
				},
			}));

			const generator = new AliasGenerator();
			const result = await generator.addAlias({
				rootPath: tmpDir,
				extensionName: 'ui.buttons',
				packagePath: path.join(tmpDir, 'ui', 'buttons'),
			});

			assert.isTrue(result);

			const aliases = JSON.parse(await fs.readFile(aliasesPath, 'utf8'));
			assert.property(aliases.compilerOptions.paths, 'ui.buttons');
		});

		it('should return false when file does not exist', async () => {
			const generator = new AliasGenerator();
			const result = await generator.addAlias({
				rootPath: tmpDir,
				extensionName: 'ui.buttons',
				packagePath: path.join(tmpDir, 'ui', 'buttons'),
			});

			assert.isFalse(result);
		});

		it('should preserve existing aliases', async () => {
			const aliasesPath = path.join(tmpDir, 'aliases.tsconfig.json');
			await fs.writeFile(aliasesPath, JSON.stringify({
				compilerOptions: {
					baseUrl: tmpDir,
					paths: {
						'main.core': ['./main/core/src'],
					},
				},
			}));

			const generator = new AliasGenerator();
			await generator.addAlias({
				rootPath: tmpDir,
				extensionName: 'ui.buttons',
				packagePath: path.join(tmpDir, 'ui', 'buttons'),
			});

			const aliases = JSON.parse(await fs.readFile(aliasesPath, 'utf8'));
			assert.property(aliases.compilerOptions.paths, 'main.core');
			assert.property(aliases.compilerOptions.paths, 'ui.buttons');
		});

		it('should end the file with a trailing newline', async () => {
			const aliasesPath = path.join(tmpDir, 'aliases.tsconfig.json');
			await fs.writeFile(aliasesPath, JSON.stringify({
				compilerOptions: {
					baseUrl: tmpDir,
					paths: {},
				},
			}));

			const generator = new AliasGenerator();
			await generator.addAlias({
				rootPath: tmpDir,
				extensionName: 'ui.buttons',
				packagePath: path.join(tmpDir, 'ui', 'buttons'),
			});

			const raw = await fs.readFile(aliasesPath, 'utf8');
			assert.match(raw, /[^\n]\n$/, 'aliases.tsconfig.json must end with a single trailing newline');
		});
	});

	describe('update', () => {
		let aliasesPath: string;

		beforeEach(async () => {
			aliasesPath = path.join(tmpDir, 'aliases.tsconfig.json');

			// Create a minimal extension structure so PackageFactory can create a package
			const extensionDir = path.join(tmpDir, 'local', 'js', 'ui', 'widget');
			await fs.mkdir(path.join(extensionDir, 'src'), { recursive: true });
			await fs.writeFile(
				path.join(extensionDir, 'bundle.config.js'),
				'module.exports = { input: "src/index.js", output: "dist/widget.bundle.js" };',
			);

			await fs.writeFile(aliasesPath, JSON.stringify({
				compilerOptions: {
					baseUrl: tmpDir,
					paths: {
						'main.core': ['./main/core/src'],
					},
				},
			}));
		});

		it('should remove aliases for removed paths', async () => {
			// Add an alias we can then remove
			const aliases = JSON.parse(await fs.readFile(aliasesPath, 'utf8'));
			aliases.compilerOptions.paths['old.extension'] = ['./old/extension/src'];
			await fs.writeFile(aliasesPath, JSON.stringify(aliases));

			// Create a minimal extension dir so PackageFactory can derive the name
			const oldDir = path.join(tmpDir, 'local', 'js', 'old', 'extension');
			await fs.mkdir(path.join(oldDir, 'src'), { recursive: true });
			await fs.writeFile(
				path.join(oldDir, 'bundle.config.js'),
				'module.exports = { input: "src/index.js", output: "dist/ext.bundle.js" };',
			);

			const generator = new AliasGenerator();
			const result = await generator.update({
				rootPath: tmpDir,
				added: [],
				removed: [oldDir],
			});

			assert.include(result.removed, 'old.extension');

			const updated = JSON.parse(await fs.readFile(aliasesPath, 'utf8'));
			assert.notProperty(updated.compilerOptions.paths, 'old.extension');
			assert.property(updated.compilerOptions.paths, 'main.core');
		});

		it('should return empty arrays when nothing changes', async () => {
			const generator = new AliasGenerator();
			const result = await generator.update({
				rootPath: tmpDir,
				added: [],
				removed: [],
			});

			assert.isEmpty(result.added);
			assert.isEmpty(result.removed);
		});

		it('should end the file with a trailing newline', async () => {
			const generator = new AliasGenerator();
			await generator.update({
				rootPath: tmpDir,
				added: [],
				removed: [],
			});

			const raw = await fs.readFile(aliasesPath, 'utf8');
			assert.match(raw, /[^\n]\n$/, 'aliases.tsconfig.json must end with a single trailing newline');
		});
	});
});
