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

	describe('convertBundleConfigExport', () => {
		// Runs the conversion against a bundle.config.ts holding `source` and returns
		// both the result flag and the rewritten file content.
		async function convert(source: string): Promise<{ converted: boolean; content: string }>
		{
			const configPath = path.join(tmpDir, 'bundle.config.ts');
			await fs.writeFile(configPath, source);

			const mockPackage = { getBundleConfigTsFilePath: () => configPath } as any;
			const migrator = new PackageMigrator(mockPackage);
			const result = await migrator.convertBundleConfigExport();

			return { converted: result.converted, content: await fs.readFile(configPath, 'utf8') };
		}

		it('should convert a flat config', async () => {
			const { converted, content } = await convert(
				'module.exports = {\n\tinput: \'src/index.js\',\n\toutput: \'dist/app.bundle.js\',\n\tnamespace: \'BX.App\',\n};\n',
			);

			assert.isTrue(converted);
			assert.include(content, 'export default {');
			assert.notInclude(content, 'module.exports');
			// Keeps the project's style: tabs, trailing comma, single trailing newline.
			assert.include(content, '\tinput: \'src/index.js\',');
			assert.include(content, '\tnamespace: \'BX.App\',');
			assert.match(content, /[^\n]\n$/);
		});

		it('should convert a config with a nested output object', async () => {
			const { converted, content } = await convert(
				'module.exports = {\n\tinput: \'src/index.js\',\n\toutput: {\n\t\tjs: \'dist/app.bundle.js\',\n\t\tcss: \'dist/app.bundle.css\',\n\t},\n\tnamespace: \'BX.UI\',\n\tbrowserslist: true,\n};\n',
			);

			assert.isTrue(converted);
			assert.include(content, 'export default {');
			assert.notInclude(content, 'module.exports');
			assert.include(content, '\t\tjs: \'dist/app.bundle.js\',');
			assert.include(content, '\t\tcss: \'dist/app.bundle.css\',');
			assert.include(content, 'browserslist: true,');
		});

		it('should convert a config with boolean and object options', async () => {
			const { converted, content } = await convert(
				'module.exports = {\n\tinput: \'src/index.js\',\n\toutput: \'dist/app.bundle.js\',\n\tnamespace: \'BX.App\',\n\tadjustConfigPhp: false,\n\tprotected: true,\n\tplugins: {\n\t\tresolve: true,\n\t},\n};\n',
			);

			assert.isTrue(converted);
			assert.include(content, 'export default {');
			assert.include(content, 'adjustConfigPhp: false,');
			assert.include(content, 'protected: true,');
			assert.include(content, '\t\tresolve: true,');
		});

		it('should keep a leading import and a plugin call', async () => {
			const { converted, content } = await convert(
				'import importDts from \'./rollup-plugin-import-dts\';\n\nmodule.exports = {\n\tinput: \'src/index.js\',\n\tplugins: {\n\t\tcustom: [\n\t\t\timportDts(),\n\t\t],\n\t},\n};\n',
			);

			assert.isTrue(converted);
			assert.include(content, 'import importDts from \'./rollup-plugin-import-dts\';');
			assert.include(content, 'export default {');
			assert.include(content, 'importDts()');
			assert.notInclude(content, 'module.exports');
		});

		it('should preserve a comment above the export', async () => {
			const { converted, content } = await convert(
				'// bundle configuration\nmodule.exports = {\n\tinput: \'src/index.js\',\n};\n',
			);

			assert.isTrue(converted);
			assert.include(content, '// bundle configuration');
			assert.include(content, 'export default {');
		});

		it('should convert a single-line config', async () => {
			const { converted, content } = await convert(
				'module.exports = { input: \'src/index.js\', namespace: \'BX.App\' };\n',
			);

			assert.isTrue(converted);
			assert.include(content, 'export default {');
			assert.include(content, 'input: \'src/index.js\'');
			assert.include(content, 'namespace: \'BX.App\'');
			assert.notInclude(content, 'module.exports');
		});

		it('should leave an already ES-module config untouched', async () => {
			const original = 'export default {\n\tinput: \'src/index.ts\',\n};\n';
			const { converted, content } = await convert(original);

			assert.isFalse(converted);
			assert.equal(content, original);
		});
	});

	describe('renameFile', () => {
		it('should produce correct .ts path from .js path', async () => {
			const mockPackage = { getPath: () => tmpDir } as any;
			const migrator = new PackageMigrator(mockPackage);

			// renameFile calls gitRename which runs `git mv`. The path isn't tracked
			// by git here, so the move fails — we only assert the result shape.
			const result = await migrator.renameFile('/some/path/app.js');

			assert.equal(result.from, '/some/path/app.js');
			assert.equal(result.to, '/some/path/app.ts');
			assert.isBoolean(result.success);
		});
	});
});
