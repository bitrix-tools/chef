import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PackageSizeCalculator } from '../../src/modules/services/package-size-calculator';

function createMockPackage(options: {
	packagePath: string;
	name?: string;
	outputJs?: string;
	outputCss?: string;
	phpConfig?: Record<string, any>;
})
{
	const {
		packagePath,
		name = 'test.extension',
		outputJs = path.join(packagePath, 'dist', 'extension.bundle.js'),
		outputCss = path.join(packagePath, 'dist', 'extension.bundle.css'),
		phpConfig = {},
	} = options;

	return {
		getName: () => name,
		getPath: () => packagePath,
		getOutputJsPath: () => outputJs,
		getOutputCssPath: () => outputCss,
		getPhpConfig: () => ({
			get: (key: string) => phpConfig[key] ?? null,
		}),
		getFlattedDependenciesTree: async () => [],
	} as any;
}

describe('PackageSizeCalculator', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'chef-size-'));
	});

	afterEach(async () => {
		await fsp.rm(tmpDir, { recursive: true });
	});

	describe('getBundlesSize', () => {
		it('should return sizes of existing JS and CSS bundles', async () => {
			const distDir = path.join(tmpDir, 'dist');
			await fsp.mkdir(distDir, { recursive: true });

			const jsContent = 'console.log("hello");';
			const cssContent = '.test { color: red; }';
			await fsp.writeFile(path.join(distDir, 'extension.bundle.js'), jsContent);
			await fsp.writeFile(path.join(distDir, 'extension.bundle.css'), cssContent);

			const mockPackage = createMockPackage({ packagePath: tmpDir });
			const calculator = new PackageSizeCalculator(mockPackage);
			const result = calculator.getBundlesSize();

			assert.equal(result.js, Buffer.byteLength(jsContent));
			assert.equal(result.css, Buffer.byteLength(cssContent));
		});

		it('should return 0 for missing bundles', () => {
			const mockPackage = createMockPackage({
				packagePath: tmpDir,
				phpConfig: { js: [], css: [] },
			});
			const calculator = new PackageSizeCalculator(mockPackage);
			const result = calculator.getBundlesSize();

			assert.equal(result.js, 0);
			assert.equal(result.css, 0);
		});

		it('should return only JS size when CSS bundle is missing', async () => {
			const distDir = path.join(tmpDir, 'dist');
			await fsp.mkdir(distDir, { recursive: true });

			const jsContent = 'var x = 1;';
			await fsp.writeFile(path.join(distDir, 'extension.bundle.js'), jsContent);

			const mockPackage = createMockPackage({ packagePath: tmpDir });
			const calculator = new PackageSizeCalculator(mockPackage);
			const result = calculator.getBundlesSize();

			assert.equal(result.js, Buffer.byteLength(jsContent));
			assert.equal(result.css, 0);
		});

		it('should fallback to config.php file sizes when no bundles exist', async () => {
			const jsFile = path.join(tmpDir, 'script.js');
			const cssFile = path.join(tmpDir, 'style.css');
			await fsp.writeFile(jsFile, 'var a = 1;');
			await fsp.writeFile(cssFile, '.a {}');

			const mockPackage = createMockPackage({
				packagePath: tmpDir,
				phpConfig: {
					js: ['script.js'],
					css: ['style.css'],
				},
			});
			const calculator = new PackageSizeCalculator(mockPackage);
			const result = calculator.getBundlesSize();

			assert.equal(result.js, Buffer.byteLength('var a = 1;'));
			assert.equal(result.css, Buffer.byteLength('.a {}'));
		});

		it('should handle paths with leading slash in config.php', async () => {
			const jsFile = path.join(tmpDir, 'dist', 'script.js');
			await fsp.mkdir(path.join(tmpDir, 'dist'), { recursive: true });
			await fsp.writeFile(jsFile, 'content');

			const mockPackage = createMockPackage({
				packagePath: tmpDir,
				name: 'ui.test',
				phpConfig: {
					js: ['/ui/test/dist/script.js'],
					css: [],
				},
			});
			const calculator = new PackageSizeCalculator(mockPackage);
			const result = calculator.getBundlesSize();

			assert.equal(result.js, Buffer.byteLength('content'));
		});
	});

	describe('getTotalTransferredSize', () => {
		it('should sum bundle and dependency sizes', async () => {
			const distDir = path.join(tmpDir, 'dist');
			await fsp.mkdir(distDir, { recursive: true });
			await fsp.writeFile(path.join(distDir, 'extension.bundle.js'), '12345');
			await fsp.writeFile(path.join(distDir, 'extension.bundle.css'), '123');

			const mockPackage = createMockPackage({ packagePath: tmpDir });
			const calculator = new PackageSizeCalculator(mockPackage);
			const result = await calculator.getTotalTransferredSize();

			assert.equal(result.js, 5);
			assert.equal(result.css, 3);
		});
	});

	describe('getDependenciesSize', () => {
		it('should return zeros when no dependencies', async () => {
			const mockPackage = createMockPackage({ packagePath: tmpDir });
			const calculator = new PackageSizeCalculator(mockPackage);
			const result = await calculator.getDependenciesSize();

			assert.equal(result.js, 0);
			assert.equal(result.css, 0);
		});
	});
});
