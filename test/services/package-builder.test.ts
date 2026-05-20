import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as fsp from 'node:fs/promises';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { PackageBuilder } from '../../src/modules/services/package-builder';
import { ChefConfigManager } from '../../src/modules/config/project/chef-config-manager';
import { BundleConfigManager } from '../../src/modules/config/bundle/bundle-config-manager';
import { PackageResolver } from '../../src/modules/packages/package-resolver';


import type { BuildResult, BuildOptions } from '../../src/modules/engines/build/build-types';

const fixturesPath = path.resolve(import.meta.dirname, '../fixtures/source-repo/ui/install/js/ui');

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
			// `assert.instanceOf` is unreliable here: PackageBuilder.getBuildEngine() loads
			// BuildEngine via `await import(...)`, and under some loaders (tsx/esm on macOS CI)
			// the dynamic and static imports of the same file end up as separate module records,
			// so `instanceof` fails despite the object being the right class. Duck-check the API
			// surface instead — that's what we actually care about.
			assert.equal(engine.constructor.name, 'BuildEngine');
			assert.isFunction((engine as unknown as { build?: unknown }).build);
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

	describe('adjustConfigPhp', () => {
		const extensionPath = path.join(fixturesPath, 'basic-extension');

		afterEach(() => {
			const distPath = path.join(extensionPath, 'dist');
			if (fs.existsSync(distPath))
			{
				fs.rmSync(distPath, { recursive: true });
			}
		});

		it('should not save config.php when adjustConfigPhp is false', async () => {
			const bundleConfig = new BundleConfigManager();
			bundleConfig.loadFromFile(path.join(extensionPath, 'bundle.config.js'));

			const phpConfig = {
				get: (key: string) => null,
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
				shouldUpdatePhpConfig: () => false,
			} as any;

			const builder = new PackageBuilder(mockPackage);
			const result = await builder.build();

			assert.isEmpty(result.errors);
			assert.isTrue(phpConfig.set.calledWith('rel', sinon.match.array), 'Should still set rel on phpConfig');
			assert.isFalse(phpConfig.save.called, 'Should NOT save config.php');
		});

		it('should save config.php when adjustConfigPhp is true', async () => {
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
			assert.isTrue(phpConfig.save.calledOnce, 'Should save config.php');
		});
	});

	describe('circular dependency diagnostics', () => {
		const extensionPath = path.join(fixturesPath, 'basic-extension');

		afterEach(() => {
			const distPath = path.join(extensionPath, 'dist');
			if (fs.existsSync(distPath))
			{
				fs.rmSync(distPath, { recursive: true });
			}
		});

		it('emits CF1006 when the extension lists itself in rel (self-dep)', async () => {
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
				shouldUpdatePhpConfig: () => false,
				getDependencies: async () => [{ name: 'test.basic' }],
				getSourceFiles: () => [],
			} as any;

			const builder = new PackageBuilder(mockPackage);
			const result = await builder.build();

			assert.isEmpty(result.errors, 'Should have no errors');

			const circular = result.warnings.filter((w) => w.code === 'CF1006');
			assert.equal(circular.length, 1, 'Should emit exactly one CF1006 warning');
			assert.include(circular[0].message, 'test.basic → test.basic', 'Should describe the cycle');
		});

		it('emits CF1006 for a mutual cycle A → B → A', async () => {
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
				getName: () => 'ext.aa',
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
				shouldUpdatePhpConfig: () => false,
				getDependencies: async () => [{ name: 'ext.bb' }],
				getSourceFiles: () => [],
			} as any;

			const otherPackage = {
				getName: () => 'ext.bb',
				getDependencies: async () => [{ name: 'ext.aa' }],
			};

			sandbox.stub(PackageResolver, 'resolve').withArgs('ext.bb').returns(otherPackage as any);

			const builder = new PackageBuilder(mockPackage);
			const result = await builder.build();

			assert.isEmpty(result.errors, 'Should have no errors');

			const circular = result.warnings.filter((w) => w.code === 'CF1006');
			assert.equal(circular.length, 1, 'Should emit exactly one CF1006 warning');
			assert.include(circular[0].message, 'ext.aa → ext.bb → ext.aa', 'Should describe the cycle');
		});

		it('emits no CF1006 when dependencies do not loop back', async () => {
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
				getName: () => 'ext.aa',
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
				shouldUpdatePhpConfig: () => false,
				getDependencies: async () => [{ name: 'ext.bb' }],
				getSourceFiles: () => [],
			} as any;

			const otherPackage = {
				getName: () => 'ext.bb',
				getDependencies: async () => [{ name: 'ext.cc' }],
			};

			sandbox.stub(PackageResolver, 'resolve').withArgs('ext.bb').returns(otherPackage as any);

			const builder = new PackageBuilder(mockPackage);
			const result = await builder.build();

			assert.isEmpty(result.errors, 'Should have no errors');

			const circular = result.warnings.filter((w) => w.code === 'CF1006');
			assert.equal(circular.length, 0, 'Should not emit any CF1006 warnings');
		});

		it('points loc to the JS import of the partner extension', async () => {
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

			// Write a temp source file that imports the partner — this is what the loc should point at.
			const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'chef-builder-circ-'));
			const sourceFile = path.join(tmpDir, 'src/consumer.js');
			await fsp.mkdir(path.dirname(sourceFile), { recursive: true });
			await fsp.writeFile(
				sourceFile,
				'// line 1\n// line 2\nimport { Foo } from "ext.bb";\nconsole.log(Foo);\n',
				'utf-8',
			);

			const mockPackage = {
				getName: () => 'ext.aa',
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
				shouldUpdatePhpConfig: () => false,
				getDependencies: async () => [{ name: 'ext.bb' }],
				getSourceFiles: () => [sourceFile],
			} as any;

			const otherPackage = {
				getName: () => 'ext.bb',
				getDependencies: async () => [{ name: 'ext.aa' }],
			};

			sandbox.stub(PackageResolver, 'resolve').withArgs('ext.bb').returns(otherPackage as any);

			try
			{
				const builder = new PackageBuilder(mockPackage);
				const result = await builder.build();

				const circular = result.warnings.filter((w) => w.code === 'CF1006');
				assert.equal(circular.length, 1);
				assert.deepEqual(circular[0].loc, { file: sourceFile, line: 3, column: 1 });
			}
			finally
			{
				await fsp.rm(tmpDir, { recursive: true, force: true });
			}
		});
	});

	describe('config.php preservation on failed build', () => {
		// The package-builder must NOT touch config.php when the build returned errors.
		// Reason: a failing build (type-check error, rollup error, baseline error, …)
		// returns `dependencies: []` because the rollup pass never ran or never finished.
		// Writing that empty list into rel previously caused config.php to be rewritten with
		// just `['main.polyfill.core']` (auto-added by PhpConfigManager) and `skip_core: true`,
		// silently corrupting the extension's manifest while the existing bundle on disk
		// still imported the real dependencies.

		function createMockPackage(overrides: {
			phpConfig?: { get: any; set?: any; save?: any };
			shouldUpdatePhpConfig?: boolean;
		} = {}): any {
			const phpConfig = overrides.phpConfig ?? {
				get: () => null,
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};

			return {
				getName: () => 'test.basic',
				getPath: () => '/tmp/fake-extension',
				getPublicPath: () => '/test/',
				getTargets: () => 'defaults',
				getInputPath: () => '/tmp/fake-extension/src/extension.js',
				getOutputJsPath: () => '/tmp/fake-extension/dist/extension.bundle.js',
				getOutputCssPath: () => '/tmp/fake-extension/dist/extension.bundle.css',
				isTypeScriptMode: () => false,
				getBundleConfig: () => ({
					get: (key: string) => {
						const config: Record<string, any> = {
							input: './src/extension.js',
							output: {
								js: './dist/extension.bundle.js',
								css: './dist/extension.bundle.css',
							},
							standalone: { enabled: false },
						};

						return config[key];
					},
					has: () => false,
				}),
				getPhpConfig: () => phpConfig,
				getPhpConfigFilePath: () => '/tmp/fake-extension/config.php',
				shouldUpdatePhpConfig: () => overrides.shouldUpdatePhpConfig ?? true,
			};
		}

		function stubBuildEngine(sandboxLocal: sinon.SinonSandbox, buildResult: BuildResult): void {
			sandboxLocal.stub(PackageBuilder, 'getBuildEngine').resolves({
				build: async () => buildResult,
				generate: async () => buildResult,
			} as any);
		}

		it('does NOT call phpConfig.set when build returned a type-check error', async () => {
			const phpConfig = {
				get: () => null,
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};

			stubBuildEngine(sandbox, createMockBuildResult({
				dependencies: [],
				errors: [{ code: 'CF1001', message: 'TS2322 Type \'string\' is not assignable to type \'number\'.' }],
			}));

			const mockPackage = createMockPackage({ phpConfig });
			const builder = new PackageBuilder(mockPackage);
			const result = await builder.build();

			assert.isNotEmpty(result.errors, 'Build result should still contain the original errors');
			assert.isFalse(phpConfig.set.called, 'phpConfig.set must not be called when build failed');
			assert.isFalse(phpConfig.save.called, 'phpConfig.save must not be called when build failed');
		});

		it('does NOT call phpConfig.set when build returned a rollup syntax error', async () => {
			const phpConfig = {
				get: () => null,
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};

			stubBuildEngine(sandbox, createMockBuildResult({
				dependencies: [],
				errors: [{ code: 'CF1002', message: 'Unexpected token' }],
			}));

			const mockPackage = createMockPackage({ phpConfig });
			const builder = new PackageBuilder(mockPackage);
			const result = await builder.build();

			assert.isNotEmpty(result.errors);
			assert.isFalse(phpConfig.set.called, 'phpConfig.set must not be called when build failed');
			assert.isFalse(phpConfig.save.called, 'phpConfig.save must not be called when build failed');
		});

		it('does NOT call phpConfig.set when build returned multiple errors', async () => {
			const phpConfig = {
				get: () => null,
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};

			stubBuildEngine(sandbox, createMockBuildResult({
				dependencies: [],
				errors: [
					{ code: 'CF1001', message: 'TS2322' },
					{ code: 'CF1001', message: 'TS2305' },
				],
			}));

			const mockPackage = createMockPackage({ phpConfig });
			const builder = new PackageBuilder(mockPackage);
			await builder.build();

			assert.isFalse(phpConfig.set.called);
			assert.isFalse(phpConfig.save.called);
		});

		it('does NOT call phpConfig.set even if errors are present alongside non-empty dependencies', async () => {
			// Defensive scenario: even if some plugin pushed into dependenciesRef before the error,
			// a build with errors must not touch config.php — the bundle on disk is unchanged.
			const phpConfig = {
				get: () => null,
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};

			stubBuildEngine(sandbox, createMockBuildResult({
				dependencies: ['main.core', 'ui.vue3'],
				errors: [{ code: 'CF1001', message: 'TS2322' }],
			}));

			const mockPackage = createMockPackage({ phpConfig });
			const builder = new PackageBuilder(mockPackage);
			await builder.build();

			assert.isFalse(phpConfig.set.called, 'phpConfig.set must not be called when errors are present');
			assert.isFalse(phpConfig.save.called, 'phpConfig.save must not be called when errors are present');
		});

		it('DOES call phpConfig.set and save when build succeeded (regression guard)', async () => {
			const phpConfig = {
				get: () => null,
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};

			stubBuildEngine(sandbox, createMockBuildResult({
				dependencies: ['main.core', 'ui.vue3'],
				errors: [],
			}));

			const mockPackage = createMockPackage({ phpConfig });
			const builder = new PackageBuilder(mockPackage);
			const result = await builder.build();

			assert.isEmpty(result.errors);
			assert.isTrue(phpConfig.set.calledWith('rel', ['main.core', 'ui.vue3']), 'rel must be saved on successful build');
			assert.isTrue(phpConfig.save.calledOnce, 'config.php must be saved on successful build');
		});

		it('DOES call phpConfig.set with empty array when build succeeded with no dependencies (regression guard)', async () => {
			// Important: an honestly empty dependencies list (e.g. a utility extension with no
			// external imports) must still be written so PhpConfigManager.save() can apply the
			// `main.polyfill.core` fallback. This test guards against an over-eager fix that
			// would skip the write whenever dependencies are empty.
			const phpConfig = {
				get: () => null,
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};

			stubBuildEngine(sandbox, createMockBuildResult({
				dependencies: [],
				errors: [],
			}));

			const mockPackage = createMockPackage({ phpConfig });
			const builder = new PackageBuilder(mockPackage);
			await builder.build();

			assert.isTrue(phpConfig.set.calledWith('rel', []), 'rel must be set even with empty deps on success');
			assert.isTrue(phpConfig.save.calledOnce, 'config.php must be saved on successful build with empty deps');
		});

		it('does NOT call phpConfig.save when build succeeded but shouldUpdatePhpConfig is false (regression guard)', async () => {
			const phpConfig = {
				get: () => null,
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};

			stubBuildEngine(sandbox, createMockBuildResult({
				dependencies: ['main.core'],
				errors: [],
			}));

			const mockPackage = createMockPackage({ phpConfig, shouldUpdatePhpConfig: false });
			const builder = new PackageBuilder(mockPackage);
			await builder.build();

			assert.isTrue(phpConfig.set.called, 'rel should still be set on the in-memory phpConfig');
			assert.isFalse(phpConfig.save.called, 'config.php must not be saved when shouldUpdatePhpConfig is false');
		});

		it('does NOT call phpConfig.set when validation denies the build (early return)', async () => {
			// Validation `denied` path (chef.config deny rules with severity=error) returns a
			// pre-baked BuildResult { dependencies: [], errors: [...] } before buildEngine.build()
			// is even reached. Guard must still hold.
			sandbox.restore();
			sandbox = sinon.createSandbox();
			sandbox.stub(ChefConfigManager, 'getInstance').returns({
				getConfig: () => ({
					deny: {
						sourceMaps: true,
					},
				}),
				getEnforce: () => undefined,
			} as any);

			const phpConfig = {
				get: () => null,
				set: sinon.stub(),
				save: sinon.stub().resolves(),
			};

			// No need to stub the build engine here — validation should short-circuit before it runs.
			const mockPackage = createMockPackage({ phpConfig });
			const builder = new PackageBuilder(mockPackage);
			const result = await builder.build();

			assert.isNotEmpty(result.errors, 'Validation should produce errors');
			assert.isFalse(phpConfig.set.called, 'phpConfig.set must not be called when validation denied build');
			assert.isFalse(phpConfig.save.called, 'phpConfig.save must not be called when validation denied build');
		});

		it('treats `dependencies: []` from RollupBuildStrategy as authoritative ONLY when errors is empty', () => {
			// This is a documentation-style invariant test on RollupBuildStrategy's contract:
			// every early-return path that sets `dependencies: []` MUST also populate `errors`.
			// If a future change adds an early return with empty deps AND empty errors, the
			// `main.polyfill.core` fallback would silently corrupt config.php again. We grep the
			// source for `dependencies: []` and assert that every such literal sits within ~10
			// lines of `errors: [` or `errors: typeCheckResult.errors`.
			const sourcePath = path.resolve(
				import.meta.dirname,
				'../../src/modules/engines/build/rollup/rollup-strategy.ts',
			);
			const source = fs.readFileSync(sourcePath, 'utf-8');
			const lines = source.split('\n');

			const violations: Array<{ line: number; context: string }> = [];
			for (let i = 0; i < lines.length; i++)
			{
				if (!/\bdependencies:\s*\[\s*\]/.test(lines[i]))
				{
					continue;
				}

				// Look within the surrounding 10 lines for a non-empty errors assignment.
				const start = Math.max(0, i - 5);
				const end = Math.min(lines.length, i + 10);
				const context = lines.slice(start, end).join('\n');

				// Accept either:
				//   errors: [<...something non-empty inside the brackets...>]
				//   errors: <expression that is not []>
				const hasNonEmptyErrors = /errors:\s*(\[[^\]]+\]|[A-Za-z_][\w.]*)/.test(context);

				if (!hasNonEmptyErrors)
				{
					violations.push({ line: i + 1, context });
				}
			}

			assert.isEmpty(
				violations,
				`Found early-return paths in rollup-strategy.ts that set dependencies: [] without `
				+ `populating errors:\n${violations.map((v) => `  line ${v.line}:\n${v.context}`).join('\n\n')}\n`
				+ `Such paths would silently corrupt config.php's rel via the main.polyfill.core fallback.`,
			);
		});
	});

	describe('config.php preservation — integration with real fixture', () => {
		// Integration-level: build a copy of the `ts-type-error` fixture, which contains a real
		// TS error in its source. Verify that the on-disk config.php is NOT overwritten with
		// the polyfill fallback when the build fails.
		const tsFixturePath = path.join(fixturesPath, 'ts-type-error');
		let tmpExtensionDir: string;

		beforeEach(async () => {
			tmpExtensionDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'chef-builder-preserve-'));
			await fsp.cp(tsFixturePath, tmpExtensionDir, { recursive: true });
		});

		afterEach(async () => {
			if (tmpExtensionDir && fs.existsSync(tmpExtensionDir))
			{
				await fsp.rm(tmpExtensionDir, { recursive: true, force: true });
			}
		});

		it('preserves on-disk config.php content when type-check fails', async () => {
			const configPhpPath = path.join(tmpExtensionDir, 'config.php');
			const originalConfigContent = fs.readFileSync(configPhpPath, 'utf-8');

			const phpConfigData: Record<string, any> = {
				rel: ['main.core', 'ui.vue3'],
			};
			const phpConfig = {
				get: (key: string) => phpConfigData[key] ?? null,
				set: sinon.stub().callsFake((key: string, value: any) => {
					phpConfigData[key] = value;
				}),
				save: sinon.stub().callsFake(async () => {
					// Mirror the real PhpConfigManager.save() — write to disk so we can prove
					// that no write happened when this stub is *not* called.
					fs.writeFileSync(configPhpPath, '<?php /* overwritten by stub */');
				}),
			};

			const bundleConfig = new BundleConfigManager();
			bundleConfig.loadFromFile(path.join(tmpExtensionDir, 'bundle.config.js'));

			const mockPackage = {
				getName: () => 'test.ts-type-error',
				getPath: () => tmpExtensionDir,
				getPublicPath: () => '/test/',
				getTargets: () => 'defaults',
				getInputPath: () => path.join(tmpExtensionDir, bundleConfig.get('input')),
				getOutputJsPath: () => path.join(tmpExtensionDir, bundleConfig.get('output').js),
				getOutputCssPath: () => path.join(tmpExtensionDir, bundleConfig.get('output').css ?? './dist/bundle.css'),
				isTypeScriptMode: () => true,
				getBundleConfig: () => bundleConfig,
				getPhpConfig: () => phpConfig,
				getPhpConfigFilePath: () => configPhpPath,
				shouldUpdatePhpConfig: () => true,
			} as any;

			const builder = new PackageBuilder(mockPackage);
			const result = await builder.build();

			assert.isNotEmpty(result.errors, 'TS error should propagate through the build result');
			assert.isFalse(phpConfig.set.called, 'phpConfig.set must not be called on failed build');
			assert.isFalse(phpConfig.save.called, 'phpConfig.save must not be called on failed build');

			// And the on-disk config.php should be byte-for-byte the same.
			const finalConfigContent = fs.readFileSync(configPhpPath, 'utf-8');
			assert.equal(finalConfigContent, originalConfigContent, 'config.php on disk must be untouched');
		});
	});
});
