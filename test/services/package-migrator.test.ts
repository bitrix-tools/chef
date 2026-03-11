import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { PackageMigrator } from '../../src/modules/services/package-migrator';

describe('PackageMigrator', () => {
	let sandbox: sinon.SinonSandbox;
	let tmpDir: string;

	beforeEach(async () => {
		sandbox = sinon.createSandbox();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-migrator-'));
	});

	afterEach(async () => {
		sandbox.restore();
		await fs.rm(tmpDir, { recursive: true });
	});

	describe('convertFile', () => {
		it('should convert Flow file to TypeScript', async () => {
			const filePath = path.join(tmpDir, 'app.ts');
			await fs.writeFile(filePath, '// @flow\nconst x: number = 1;');

			const mockPackage = { getPath: () => tmpDir } as any;
			const migrator = new PackageMigrator(mockPackage);
			const result = await migrator.convertFile(filePath);

			assert.isTrue(result.success);
			assert.equal(result.path, filePath);

			const content = await fs.readFile(filePath, 'utf8');
			assert.notInclude(content, '@flow');
		});

		it('should return success false when file does not exist', async () => {
			const mockPackage = { getPath: () => tmpDir } as any;
			const migrator = new PackageMigrator(mockPackage);
			const result = await migrator.convertFile('/nonexistent/file.ts');

			assert.isFalse(result.success);
			assert.equal(result.path, '/nonexistent/file.ts');
		});

		it('should preserve non-Flow code', async () => {
			const filePath = path.join(tmpDir, 'plain.ts');
			const code = 'const x: number = 42;\nexport { x };';
			await fs.writeFile(filePath, code);

			const mockPackage = { getPath: () => tmpDir } as any;
			const migrator = new PackageMigrator(mockPackage);
			const result = await migrator.convertFile(filePath);

			assert.isTrue(result.success);
			const content = await fs.readFile(filePath, 'utf8');
			assert.include(content, 'const x: number = 42');
		});
	});

	describe('updateBundleConfigEntryPoint', () => {
		it('should update .js entry point to .ts', async () => {
			const bundleConfig = {
				get: sinon.stub().returns('./src/app.js'),
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};
			const mockPackage = {
				getBundleConfig: () => bundleConfig,
				getBundleConfigJsFilePath: () => '/test/bundle.config.js',
			} as any;

			const migrator = new PackageMigrator(mockPackage);
			const result = await migrator.updateBundleConfigEntryPoint();

			assert.isTrue(result);
			assert.isTrue(bundleConfig.set.calledWith('input', './src/app.ts'));
			assert.isTrue(bundleConfig.save.calledWith('/test/bundle.config.js'));
		});

		it('should return false when input is not a string', async () => {
			const bundleConfig = {
				get: sinon.stub().returns(undefined),
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};
			const mockPackage = {
				getBundleConfig: () => bundleConfig,
				getBundleConfigJsFilePath: () => '/test/bundle.config.js',
			} as any;

			const migrator = new PackageMigrator(mockPackage);
			const result = await migrator.updateBundleConfigEntryPoint();

			assert.isFalse(result);
			assert.isFalse(bundleConfig.set.called);
			assert.isFalse(bundleConfig.save.called);
		});

		it('should handle entry point without .js extension', async () => {
			const bundleConfig = {
				get: sinon.stub().returns('./src/index'),
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};
			const mockPackage = {
				getBundleConfig: () => bundleConfig,
				getBundleConfigJsFilePath: () => '/test/bundle.config.js',
			} as any;

			const migrator = new PackageMigrator(mockPackage);
			const result = await migrator.updateBundleConfigEntryPoint();

			assert.isTrue(result);
			// Input doesn't end with .js, so replace won't change it
			assert.isTrue(bundleConfig.set.calledWith('input', './src/index'));
		});
	});

	describe('renameFile', () => {
		it('should produce correct .ts path from .js path', async () => {
			const mockPackage = { getPath: () => tmpDir } as any;
			const migrator = new PackageMigrator(mockPackage);

			// renameFile will call hgRename which calls spawnSync('hg', ...)
			// In test env, hg is not available, so we check the result shape
			const result = await migrator.renameFile('/some/path/app.js');

			assert.equal(result.from, '/some/path/app.js');
			assert.equal(result.to, '/some/path/app.ts');
			assert.isBoolean(result.success);
		});
	});
});
