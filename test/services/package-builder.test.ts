import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as fsp from 'node:fs/promises';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { PackageBuilder } from '../../src/modules/services/package-builder';
import { BuildEngine } from '../../src/modules/engines/build/build-engine';
import { ChefConfigManager } from '../../src/modules/config/project/chef-config-manager';
import { BundleConfigManager } from '../../src/modules/config/bundle/bundle-config-manager';


import type { BuildResult, BuildOptions } from '../../src/modules/engines/build/build-types';

const fixturesPath = path.join(import.meta.dirname, '..', 'build', 'fixtures');

function createMockBuildResult(overrides: Partial<BuildResult> = {}): BuildResult
{
	return {
		warnings: [],
		errors: [],
		bundles: [],
		dependencies: [],
		standalone: false,
		...overrides,
	};
}

describe('PackageBuilder', () => {
	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		sandbox = sinon.createSandbox();

		sandbox.stub(ChefConfigManager, 'getInstance').returns({
			getConfig: () => ({}),
		} as any);
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('getBuildEngine', () => {
		it('should return a BuildEngine instance', async () => {
			const engine = await PackageBuilder.getBuildEngine();
			assert.instanceOf(engine, BuildEngine);
		});

		it('should cache the build engine instance', async () => {
			const engine1 = await PackageBuilder.getBuildEngine();
			const engine2 = await PackageBuilder.getBuildEngine();
			assert.strictEqual(engine1, engine2);
		});
	});

	describe('build with real fixtures', () => {
		const extensionPath = path.join(fixturesPath, 'basic-extension');
		let tmpDir: string;

		beforeEach(async () => {
			tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'chef-builder-'));
		});

		afterEach(async () => {
			// Clean dist in fixture
			const distPath = path.join(extensionPath, 'dist');
			if (fs.existsSync(distPath))
			{
				fs.rmSync(distPath, { recursive: true });
			}
			await fsp.rm(tmpDir, { recursive: true });
		});

		it('should assemble correct build options from package', async () => {
			const bundleConfig = new BundleConfigManager();
			bundleConfig.loadFromFile(path.join(extensionPath, 'bundle.config.js'));

			const phpConfigData: Record<string, any> = { rel: [] };
			const phpConfig = {
				get: (key: string) => phpConfigData[key] ?? null,
				set: sinon.stub().callsFake((key: string, value: any) => {
					phpConfigData[key] = value;
				}),
				save: sinon.stub().resolves(),
			};

			const mockPackage = {
				getName: () => 'test.basic',
				getPath: () => extensionPath,
				getPublicPath: () => '/test/',
				getTargets: () => 'defaults',
				getInputPath: () => path.join(extensionPath, bundleConfig.get('input')),
				getOutputJsPath: () => path.join(extensionPath, bundleConfig.get('output').js),
				getOutputCssPath: () => path.join(extensionPath, bundleConfig.get('output').css),
				isTypeScriptMode: () => false,
				getBundleConfig: () => bundleConfig,
				getPhpConfig: () => phpConfig,
				getPhpConfigFilePath: () => path.join(extensionPath, 'config.php'),
				shouldUpdatePhpConfig: () => true,
			} as any;

			const builder = new PackageBuilder(mockPackage);
			const result = await builder.build();

			assert.isEmpty(result.errors);
			assert.include(result.dependencies, 'main.core');
			assert.isTrue(phpConfig.set.calledWith('rel', sinon.match.array));
			assert.isTrue(phpConfig.save.calledOnce);

			// Verify JS bundle was created
			const jsOutput = path.join(extensionPath, 'dist', 'extension.bundle.js');
			assert.isTrue(fs.existsSync(jsOutput));
		});
	});

	describe('generate', () => {
		const extensionPath = path.join(fixturesPath, 'basic-extension');

		afterEach(() => {
			const distPath = path.join(extensionPath, 'dist');
			if (fs.existsSync(distPath))
			{
				fs.rmSync(distPath, { recursive: true });
			}
		});

		it('should generate without writing files or saving config', async () => {
			const bundleConfig = new BundleConfigManager();
			bundleConfig.loadFromFile(path.join(extensionPath, 'bundle.config.js'));

			const phpConfig = {
				get: () => null,
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};

			const mockPackage = {
				getName: () => 'test.basic',
				getPath: () => extensionPath,
				getPublicPath: () => '/test/',
				getTargets: () => 'defaults',
				getInputPath: () => path.join(extensionPath, bundleConfig.get('input')),
				getOutputJsPath: () => path.join(extensionPath, bundleConfig.get('output').js),
				getOutputCssPath: () => path.join(extensionPath, bundleConfig.get('output').css),
				isTypeScriptMode: () => false,
				getBundleConfig: () => bundleConfig,
				getPhpConfig: () => phpConfig,
				getPhpConfigFilePath: () => path.join(extensionPath, 'config.php'),
				shouldUpdatePhpConfig: () => true,
			} as any;

			const builder = new PackageBuilder(mockPackage);
			const result = await builder.generate();

			assert.isEmpty(result.errors);
			assert.include(result.dependencies, 'main.core');

			// generate should NOT save php config
			assert.isFalse(phpConfig.set.called);
			assert.isFalse(phpConfig.save.called);
		});
	});

	describe('includes filtering', () => {
		const extensionPath = path.join(fixturesPath, 'basic-extension');

		afterEach(() => {
			const distPath = path.join(extensionPath, 'dist');
			if (fs.existsSync(distPath))
			{
				fs.rmSync(distPath, { recursive: true });
			}
		});

		it('should filter out dependencies in includes', async () => {
			const bundleConfig = new BundleConfigManager();
			bundleConfig.loadFromFile(path.join(extensionPath, 'bundle.config.js'));

			const phpConfigData: Record<string, any> = {
				rel: [],
				includes: ['main.core'],
			};
			const phpConfig = {
				get: (key: string) => phpConfigData[key] ?? null,
				set: sinon.stub().callsFake((key: string, value: any) => {
					phpConfigData[key] = value;
				}),
				save: sinon.stub().resolves(),
			};

			const mockPackage = {
				getName: () => 'test.basic',
				getPath: () => extensionPath,
				getPublicPath: () => '/test/',
				getTargets: () => 'defaults',
				getInputPath: () => path.join(extensionPath, bundleConfig.get('input')),
				getOutputJsPath: () => path.join(extensionPath, bundleConfig.get('output').js),
				getOutputCssPath: () => path.join(extensionPath, bundleConfig.get('output').css),
				isTypeScriptMode: () => false,
				getBundleConfig: () => bundleConfig,
				getPhpConfig: () => phpConfig,
				getPhpConfigFilePath: () => path.join(extensionPath, 'config.php'),
				shouldUpdatePhpConfig: () => true,
			} as any;

			const builder = new PackageBuilder(mockPackage);
			await builder.build();

			const savedDeps = phpConfig.set.firstCall.args[1] as string[];
			assert.notInclude(savedDeps, 'main.core');
		});
	});

	describe('chef config integration', () => {
		const extensionPath = path.join(fixturesPath, 'basic-extension');

		afterEach(() => {
			const distPath = path.join(extensionPath, 'dist');
			if (fs.existsSync(distPath))
			{
				fs.rmSync(distPath, { recursive: true });
			}
		});

		it('should apply enforce targets from chef config', async () => {
			sandbox.restore();
			sandbox = sinon.createSandbox();
			sandbox.stub(ChefConfigManager, 'getInstance').returns({
				getConfig: () => ({
					enforce: { targets: 'chrome 100' },
				}),
			} as any);

			const bundleConfig = new BundleConfigManager();
			bundleConfig.loadFromFile(path.join(extensionPath, 'bundle.config.js'));

			const phpConfig = {
				get: () => null,
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};

			const mockPackage = {
				getName: () => 'test.basic',
				getPath: () => extensionPath,
				getPublicPath: () => '/test/',
				getTargets: () => ['firefox 90'],
				getInputPath: () => path.join(extensionPath, bundleConfig.get('input')),
				getOutputJsPath: () => path.join(extensionPath, bundleConfig.get('output').js),
				getOutputCssPath: () => path.join(extensionPath, bundleConfig.get('output').css),
				isTypeScriptMode: () => false,
				getBundleConfig: () => bundleConfig,
				getPhpConfig: () => phpConfig,
				getPhpConfigFilePath: () => path.join(extensionPath, 'config.php'),
				shouldUpdatePhpConfig: () => true,
			} as any;

			const builder = new PackageBuilder(mockPackage);
			const result = await builder.build();

			// Should build successfully regardless of target
			assert.isEmpty(result.errors);
		});
	});
});
