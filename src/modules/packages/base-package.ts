import * as path from 'node:path';
import * as fs from 'node:fs';
import fg from 'fast-glob';
import chalk from 'chalk';
import { spawn } from 'node:child_process';

import browserslist from 'browserslist';

import { BundleConfigManager } from '../config/bundle/bundle.config.manager';
import { PhpConfigManager } from '../config/php/php.config.manager';
import { MemoryCache } from '../../utils/memory-cache';
import { PackageResolver } from './package.resolver';
import { LintResult } from '../linter/lint.result';
import { Environment } from '../../environment/environment';
import { flattenTree } from '../../utils/flatten.tree';
import { buildDependenciesTree } from '../../utils/package/build.dependencies.tree';
import { FileFinder } from '../../utils/file.finder';

import type { PlaywrightTestConfig } from '@playwright/test';
import type { BuildService } from '../services/build/build.service';
import type { BuildOptions, BuildResult } from '../services/build/types/build.service.types';
import type { DependencyNode } from './types/dependency.node';

type BasePackageOptions = {
	path: string,
};

export abstract class BasePackage
{
	static TYPESCRIPT_EXTENSION = 'ts';
	static JAVASCRIPT_EXTENSION = 'js';
	static SOURCE_FILES_PATTERN: Array<string> = [
		`**/*.${BasePackage.JAVASCRIPT_EXTENSION}`,
		`**/*.${BasePackage.TYPESCRIPT_EXTENSION}`,
	];

	readonly #path: string;
	readonly #cache: MemoryCache = new MemoryCache();

	constructor(options: BasePackageOptions)
	{
		this.#path = options.path;
	}

	#getBuildService(): Promise<BuildService>
	{
		return this.#cache.remember('buildService', async () => {
			const [
				{ BuildService },
				{ RollupBuildStrategy },
			] = await Promise.all([
				import('../services/build/build.service'),
				import('../services/build/strategies/rollup.strategy'),
			]);

			return new BuildService(
				new RollupBuildStrategy(),
			);
		});
	}

	getPath(): string
	{
		return this.#path;
	}

	getBundleConfigJsFilePath(): string
	{
		return path.join(this.getPath(), 'bundle.config.js');
	}

	hasBundleConfigJsFile(): boolean
	{
		return fs.existsSync(this.getBundleConfigJsFilePath());
	}

	getBundleConfigTsFilePath(): string
	{
		return path.join(this.getPath(), 'bundle.config.ts');
	}

	hasBundleConfigTsFile(): boolean
	{
		return fs.existsSync(this.getBundleConfigTsFilePath());
	}

	getScriptEs6FilePath(): string
	{
		return path.join(this.getPath(), 'script.es6.js');
	}

	hasScriptEs6FilePath(): boolean
	{
		return fs.existsSync(this.getScriptEs6FilePath());
	}

	getBundleConfigFilePath(): string | null
	{
		if (this.hasBundleConfigJsFile())
		{
			return this.getBundleConfigJsFilePath()
		}

		if (this.hasBundleConfigTsFile())
		{
			return this.getBundleConfigTsFilePath();
		}

		return null;
	}

	hasBundleConfigFile(): boolean
	{
		const bundleConfigFilePath = this.getBundleConfigFilePath();

		return (
			bundleConfigFilePath
			&& fs.existsSync(bundleConfigFilePath)
		);
	}

	getPhpConfigFilePath(): string
	{
		return path.join(this.getPath(), 'config.php');
	}

	hasPhpConfigFile(): boolean
	{
		return fs.existsSync(this.getPhpConfigFilePath());
	}

	getPhpConfig(): any
	{
		return this.#cache.remember('phpConfig', () => {
			const config = new PhpConfigManager();
			if (this.hasPhpConfigFile())
			{
				config.loadFromFile(this.getPhpConfigFilePath());
			}

			return config;
		});
	}

	abstract getName(): string
	abstract getModuleName(): string

	getPublicPath(): string
	{
		return '';
	}

	protected resolvePublicPath(relativePath: string): string
	{
		const environmentType = Environment.getType();

		if (environmentType === 'source')
		{
			return `/bitrix/${relativePath}/`;
		}

		if (environmentType === 'project')
		{
			const localPath = `/local/${relativePath}/`;
			const fullLocalPath = path.join(Environment.getRoot(), localPath);
			if (fs.existsSync(fullLocalPath))
			{
				return localPath;
			}

			const bitrixPath = `/bitrix/${relativePath}/`;
			const fullBitrixPath = path.join(Environment.getRoot(), bitrixPath);
			if (fs.existsSync(fullBitrixPath))
			{
				return bitrixPath;
			}
		}

		return '';
	}

	getBundleConfig(): BundleConfigManager
	{
		return this.#cache.remember('bundleConfig', () => {
			const config = new BundleConfigManager();
			if (this.hasBundleConfigFile())
			{
				config.loadFromFile(this.getBundleConfigFilePath());
			}
			else if (this.hasScriptEs6FilePath())
			{
				config.set('input', 'script.es6.js');
				config.set('output', { js: './script.js', css: './style.css' });
				config.set('adjustConfigPhp', false);
			}

			return config;
		});
	}

	getTargets(): Array<string>
	{
		const bundleConfig = this.getBundleConfig();
		const value = bundleConfig.get('targets');

		if (typeof value === 'string' || Array.isArray(value))
		{
			return browserslist(value);
		}

		const fileTargets = browserslist.loadConfig({
			path: this.getPath(),
		});

		if (fileTargets && fileTargets.length > 0)
		{
			return browserslist(fileTargets);
		}

		return browserslist('baseline widely available');
	}

	getGlobal(): { [name: string]: string }
	{
		const name = this.getName();
		const namespace = this.getBundleConfig().get('namespace');

		return { [name]: namespace };
	}

	getInputPath(): string
	{
		return path.join(this.getPath(), this.getBundleConfig().get('input'));
	}

	getOutputJsPath(): string
	{
		return path.join(this.getPath(), this.getBundleConfig().get('output').js);
	}

	getOutputCssPath(): string
	{
		return path.join(this.getPath(), this.getBundleConfig().get('output').css);
	}

	getSourceDirectoryPath(): string
	{
		return path.join(this.getPath(), 'src');
	}

	getSourceFiles(): Array<string>
	{
		return this.#cache.remember('sourceFiles', () => {
			return fg.sync(
				BasePackage.SOURCE_FILES_PATTERN,
				{
					cwd: this.getSourceDirectoryPath(),
					dot: true,
					onlyFiles: true,
					unique: true,
					absolute: true,
				},
			);
		});
	}

	getJavaScriptSourceFiles(): Array<string>
	{
		return this.#cache.remember('javaScriptSourceFiles', () => {
			return this.getSourceFiles().filter((sourceFile) => {
				return sourceFile.endsWith(`.${BasePackage.JAVASCRIPT_EXTENSION}`);
			});
		});
	}

	getTypeScriptSourceFiles(): Array<string>
	{
		return this.#cache.remember('typeScriptSourceFiles', () => {
			return this.getSourceFiles().filter((sourceFile) => {
				return sourceFile.endsWith(`.${BasePackage.TYPESCRIPT_EXTENSION}`);
			});
		});
	}

	getActualSourceFiles(): Array<string>
	{
		if (this.isTypeScriptMode())
		{
			return this.getTypeScriptSourceFiles();
		}

		return this.getJavaScriptSourceFiles();
	}

	isTypeScriptMode(): boolean
	{
		return this.getInputPath().endsWith('.ts');
	}

	getUnitTestsDirectoryPath(): string
	{
		const unitDir = path.join(this.getPath(), 'test', 'unit');
		if (fs.existsSync(unitDir))
		{
			return unitDir;
		}

		// Fallback for legacy structure
		return path.join(this.getPath(), 'test');
	}

	getEndToEndTestsDirectoryPath(): string
	{
		return path.join(this.getPath(), 'test', 'e2e');
	}

	#hasNewTestStructure(): boolean
	{
		return fs.existsSync(path.join(this.getPath(), 'test', 'unit'));
	}

	#getBuildOptions(options: { production?: boolean } = {}): BuildOptions
	{
		const production = options.production ?? false;
		const bundleConfig = this.getBundleConfig();

		return {
			input: this.getInputPath(),
			output: {
				js: this.getOutputJsPath(),
				css: this.getOutputCssPath(),
			},
			packageRoot: this.getPath(),
			publicPath: this.getPublicPath(),
			targets: this.getTargets(),
			namespace: bundleConfig.get('namespace'),
			typescript: this.isTypeScriptMode(),
			vue: this.#hasVueFiles(),
			concat: bundleConfig.get('concat'),
			cssImages: bundleConfig.get('cssImages'),
			resolveFiles: bundleConfig.get('resolveFilesImport'),
			minify: bundleConfig.has('minification')
				? bundleConfig.get('minification')
				: production,
			sourceMaps: bundleConfig.has('sourceMaps')
				? bundleConfig.get('sourceMaps')
				: !production,
			standalone: bundleConfig.get('standalone'),
			transformClasses: bundleConfig.get('transformClasses'),
			customPlugins: bundleConfig.get('plugins')?.custom,
			production,
		};
	}

	#hasVueFiles(): boolean
	{
		return fg.sync('src/**/*.vue', { cwd: this.getPath() }).length > 0;
	}

	async build(options: { production?: boolean } = {}): Promise<BuildResult>
	{
		const buildService = await this.#getBuildService();
		const buildOptions = this.#getBuildOptions(options);

		const buildResult = await buildService.build(buildOptions);

		const phpConfig = this.getPhpConfig();

		// Filter out dependencies that are already included in the bundle
		const includes = new Set<string>(phpConfig.get('includes') ?? []);
		const dependencies = buildResult.dependencies.filter(dep => !includes.has(dep));

		phpConfig.set('rel', dependencies);
		phpConfig.save(this.getPhpConfigFilePath(), this.getName());

		return buildResult;
	}

	async generate(options: { production?: boolean } = {}): Promise<BuildResult>
	{
		const buildService = await this.#getBuildService();
		const buildOptions = this.#getBuildOptions(options);

		return buildService.generate(buildOptions);
	}

	async lint(): Promise<LintResult>
	{
		const { ESLint } = await import('eslint');

		const eslint = new ESLint({
			errorOnUnmatchedPattern: false,
			cwd: Environment.getRoot(),
		});

		const results = await eslint.lintFiles(
			path.join(this.getPath(), 'src', '**/*.js'),
		);

		return new LintResult({
			results,
		});
	}

	async getDependencies(): Promise<Array<DependencyNode>>
	{
		return this.#cache.remember('dependencies', async () => {
			const phpConfig = this.getPhpConfig();
			if (phpConfig)
			{
				const rel = phpConfig.get('rel');
				if (Array.isArray(rel))
				{
					return rel.map((name: string) => {
						return { name };
					});
				}
			}

			if (this.hasBundleConfigJsFile())
			{
				const buildService = await this.#getBuildService();
				const buildOptions = this.#getBuildOptions();
				const { dependencies } = await buildService.build(buildOptions);

				return dependencies.map((name: string) => {
					return { name };
				});
			}

			return [];
		});
	}

	async getDependenciesTree(options: { size?: boolean, unique?: boolean } = {}): Promise<Array<DependencyNode>>
	{
		return this.#cache.remember(`dependenciesTree+${options.size}+${options.unique}`, () => {
			return buildDependenciesTree({
				target: this,
				...options,
			});
		});
	}

	async getFlattedDependenciesTree(unique: boolean = true): Promise<Array<DependencyNode>>
	{
		return this.#cache.remember(`flattedDependenciesTree+${unique}`, async () => {
			return flattenTree(await this.getDependenciesTree(), unique);
		});
	}

	normalizePath(sourcePath: string): string
	{
		if (sourcePath.startsWith('/'))
		{
			const nameSegment = `${this.getName().split('.').join('/')}/`;
			const [, relativePath] = sourcePath.split(nameSegment);

			return relativePath;
		}

		return sourcePath;
	}

	getBundlesSize(): { css: number, js: number }
	{
		return this.#cache.remember('bundleSize', () => {
			let result = { css: 0, js: 0 };
			const isExistJsBundle = fs.existsSync(this.getOutputJsPath());
			const isExistCssBundle = fs.existsSync(this.getOutputCssPath());
			if (isExistJsBundle || isExistCssBundle)
			{
				if (fs.existsSync(this.getOutputJsPath()))
				{
					result.js = fs.statSync(this.getOutputJsPath()).size;
				}

				if (fs.existsSync(this.getOutputCssPath()))
				{
					result.css = fs.statSync(this.getOutputCssPath()).size;
				}
			}
			else
			{
				const phpConfig = this.getPhpConfig();
				const jsFiles = [phpConfig.get('js')].flat(2);
				const cssFiles = [phpConfig.get('css')].flat(2);

				result.js = jsFiles.reduce((acc, filePath) => {
					if (filePath.length > 0)
					{
						const normalizedPath = this.normalizePath(filePath);
						const fullPath = path.join(this.getPath(), normalizedPath);
						if (fs.existsSync(fullPath))
						{
							acc += fs.statSync(fullPath).size;
						}
					}

					return acc;
				}, 0);

				result.css = cssFiles.reduce((acc, filePath) => {
					if (filePath.length > 0)
					{
						const normalizedPath = this.normalizePath(filePath);
						const fullPath = path.join(this.getPath(), normalizedPath);
						if (fs.existsSync(fullPath))
						{
							acc += fs.statSync(fullPath).size;
						}
					}

					return acc;
				}, 0);
			}

			return result;
		});
	}

	async getDependenciesSize(): Promise<{ js: number, css: number }>
	{
		return this.#cache.remember('getDependenciesSize', async () => {
			const dependencies = await this.getFlattedDependenciesTree();

			return dependencies.reduce((acc, dependency: DependencyNode) => {
				const extension = PackageResolver.resolve(dependency.name);
				if (extension)
				{
					const { js, css } = extension.getBundlesSize();
					acc.js += js;
					acc.css += css;
				}

				return acc;

			}, { js: 0, css: 0 });
		});
	}

	async getTotalTransferredSize(): Promise<{ css: number, js: number }>
	{
		const bundlesSize = this.getBundlesSize();
		const dependenciesSize = await this.getDependenciesSize();

		return {
			js: bundlesSize.js + dependenciesSize.js,
			css: bundlesSize.css + dependenciesSize.css,
		};
	}

	getPlaywrightConfigPath(): string | null
	{
		const tsVersion = FileFinder.findUpFile({
			fileName: 'playwright.config.ts',
			fromDir: this.getPath(),
			rootDir: Environment.getRoot(),
		});

		if (tsVersion)
		{
			return tsVersion;
		}

		return FileFinder.findUpFile({
			fileName: 'playwright.config.js',
			fromDir: this.getPath(),
			rootDir: Environment.getRoot(),
		});
	}

	async getPlaywrightConfig(): Promise<PlaywrightTestConfig | null>
	{
		const playwrightConfigPath = this.getPlaywrightConfigPath();
		if (playwrightConfigPath === null)
		{
			return null;
		}

		const playwrightConfigModule = await import(playwrightConfigPath);

		return (
			playwrightConfigModule.default.default
			|| playwrightConfigModule.default
			|| playwrightConfigModule
			|| null
		);
	}

	async getUnitTests(): Promise<Array<string>>
	{
		const patterns = [
			'**/*.test.js',
			'**/*.test.ts',
		];

		// Exclude e2e only for legacy test structure (tests in test/ root)
		if (!this.#hasNewTestStructure())
		{
			patterns.push('!**/e2e');
		}

		return fg.async(
			patterns,
			{
				cwd: this.getUnitTestsDirectoryPath(),
				dot: true,
				onlyFiles: true,
				unique: true,
				absolute: true,
			},
		);
	}

	async getUnitTestsBundle(options: { sourcemap?: boolean; file?: string } = {}): Promise<string>
	{
		const allTests = await this.getUnitTests();
		const filteredTests = options.file
			? allTests.filter((filePath) => filePath.includes(path.basename(options.file)))
			: allTests;

		const sourceTestsCode = filteredTests
			.map((filePath) => {
				return `import '${filePath}';`;
			})
			.join('\n');

		const buildService = await this.#getBuildService();
		const buildResult = await buildService.buildCode({
			code: sourceTestsCode,
			targets: this.getTargets(),
			packageRoot: this.getPath(),
			publicPath: this.getPublicPath(),
			typescript: this.isTypeScriptMode(),
			namespace: 'BX.TestsBundle',
			sourcemap: options.sourcemap,
		});

		return buildResult.code;
	}

	async getEndToEndTests(): Promise<Array<string>>
	{
		const patterns = [
			'**/*.test.js',
			'**/*.test.ts',
			'**/*.spec.js',
			'**/*.spec.ts',
		];

		return fg.async(
			patterns,
			{
				cwd: this.getEndToEndTestsDirectoryPath(),
				dot: true,
				onlyFiles: true,
				unique: true,
				absolute: true,
			},
		);
	}

	async runUnitTests(args: Record<string, any> = {}): Promise<any>
	{
		const playwrightConfig = await this.getPlaywrightConfig();
		if (playwrightConfig === null)
		{
			return {
				report: [],
				stats: [],
				errors: [
					new Error('playwright.config.ts does not exist run `chef init test` for configure playwright'),
				],
			};
		}

		const browserType = (args.browserType ?? 'chromium') as 'chromium' | 'firefox' | 'webkit';
		const playwright = await import('playwright');
		const browserLauncher = playwright[browserType];
		if (!browserLauncher)
		{
			return {
				report: [],
				stats: [],
				errors: [
					new Error(`Unknown browser type: ${browserType}`),
				],
			};
		}

		const isDebug = !!args.debug;
		const browser = await browserLauncher.launch({
			headless: isDebug ? false : !args.headed,
			...(isDebug ? {
				slowMo: 250,
				devtools: true,
				args: ['--auto-open-devtools-for-tabs'],
			} : {}),
		});
		const context = await browser.newContext();
		const page = await context.newPage();

		try
		{
			const testsPage = path.join(
				playwrightConfig.use.baseURL,
				`/dev/ui/cli/mocha-wrapper.php?extension=${this.getName()}`,
			);

			await page.goto(testsPage);

			const testsCodeBundle = await this.getUnitTestsBundle({
				sourcemap: isDebug,
				file: args.file,
			});

			const report = [];
			const consoleLogs: Array<{ type: string; text: string }> = [];

			page.on('console', async (message) => {
				try
				{
					const values: string[] = [];
					for (const arg of message.args())
					{
						try
						{
							const value = await arg.jsonValue();
							values.push(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
						}
						catch
						{
							// For complex objects that can't be serialized, get string representation
							try
							{
								const str = await arg.evaluate((obj: unknown) => {
									if (obj === null) return 'null';
									if (obj === undefined) return 'undefined';
									if (typeof obj === 'object')
									{
										try
										{
											return JSON.stringify(obj, null, 2);
										}
										catch
										{
											return String(obj);
										}
									}
									return String(obj);
								});
								values.push(str);
							}
							catch
							{
								values.push('[unserializable]');
							}
						}
					}

					const [key, value] = values;
					if (key === 'unit_report_token')
					{
						try
						{
							report.push(JSON.parse(value));
						}
						catch (error)
						{
							console.error(error);
						}
					}
					else
					{
						const type = message.type();
						consoleLogs.push({ type, text: values.join(' ') });
					}
				}
				catch (err)
				{
					consoleLogs.push({ type: 'error', text: `[console capture error: ${err}]` });
				}
			});

			const grep = args.grep ?? null;
			const timeout = args.debug ? 60000 : 10000;

			await page.evaluate(({ grep, timeout }) => {
				// @ts-ignore
				globalThis.mocha.setup({
					ui: 'bdd',
					// @ts-ignore
					reporter: ProxyReporter,
					checkLeaks: true,
					timeout,
					inlineDiffs: true,
					color: true,
					...(grep ? { grep } : {}),
				});
			}, { grep, timeout });

			await page.addScriptTag({
				content: testsCodeBundle,
			});

			type TestStats = Promise<{ stats: any }>;

			const { stats } = await page.evaluate((): TestStats => {
				return new Promise((resolve) => {
					// @ts-ignore
					globalThis.mocha.run(() => {
						resolve({
							// @ts-ignore
							stats: globalThis.mocha.stats,
						});
					});
				});
			});

			// Wait for pending console events to be processed
			await new Promise(resolve => setTimeout(resolve, 100));

			if (!isDebug)
			{
				await browser.close();
			}

			const debugCleanup = isDebug
				? async () => {
					await new Promise<void>((resolve) => {
						page.on('close', () => resolve());
						process.on('SIGINT', async () => {
							await browser.close();
							resolve();
						});
					});
				}
				: null;

			return {
				report,
				stats,
				consoleLogs,
				errors: [],
				debugCleanup,
			};
		}
		catch (error)
		{
			await browser.close().catch(() => {});

			return {
				report: [],
				consoleLogs: [],
				errors: [error],
			};
		}
	}

	async runEndToEndTests(sourceArgs: Record<string, any> = {}): Promise<any>
	{
		const playwrightConfig = this.getPlaywrightConfig();
		if (playwrightConfig === null)
		{
			return {
				report: [],
				stats: [],
				errors: [
					new Error('playwright.config.ts does not exist run `chef init test` for configure playwright'),
				],
			};
		}

		const tests = await this.getEndToEndTests();
		if (tests.length === 0)
		{
			return Promise.resolve({
				status: 'NO_TESTS_FOUND',
				code: 1,
			});
		}
		const args = ['playwright', 'test'];

		if (Object.hasOwn(sourceArgs, 'headed'))
		{
			args.push('--headed');
		}

		if (Object.hasOwn(sourceArgs, 'debug'))
		{
			args.push('--debug');
		}

		if (Object.hasOwn(sourceArgs, 'grep'))
		{
			args.push(`--grep=${sourceArgs.grep}`);
		}

		if (Object.hasOwn(sourceArgs, 'project'))
		{
			args.push(`--project=${sourceArgs.project}`);
		}

		if (sourceArgs.file)
		{
			args.push(sourceArgs.file);
		}

		const process = spawn('npx', args, {
			stdio: 'inherit',
			cwd: Environment.getRoot(),
			env: {
				...global.process.env,
				TESTS_DIR: this.getEndToEndTestsDirectoryPath(),
			},
		});

		return new Promise((resolve, reject) => {
			process.on('close', (code) => {
				if (code === 0)
				{
					resolve({
						status: 'TESTS_PASSED',
						code: 0,
					});
				}
				else
				{
					reject({
						status: 'TESTS_FAILED',
						code: 0,
					});
				}
			});
		});
	}
}

