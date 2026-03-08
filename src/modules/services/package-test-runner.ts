import * as path from 'node:path';
import { spawn } from 'node:child_process';

import type { PlaywrightTestConfig } from '@playwright/test';
import type { BasePackage } from '../packages/base-package';
import { Environment } from '../../environment/environment';
import { FileFinder } from '../../utils/file-finder';
import { PackageBuilder } from './package-builder';

export class PackageTestRunner
{
	readonly #package: BasePackage;

	constructor(extensionPackage: BasePackage)
	{
		this.#package = extensionPackage;
	}

	#getPlaywrightConfigPath(): string | null
	{
		const tsVersion = FileFinder.findUpFile({
			fileName: 'playwright.config.ts',
			fromDir: this.#package.getPath(),
			rootDir: Environment.getRoot(),
		});

		if (tsVersion)
		{
			return tsVersion;
		}

		return FileFinder.findUpFile({
			fileName: 'playwright.config.js',
			fromDir: this.#package.getPath(),
			rootDir: Environment.getRoot(),
		});
	}

	async #getPlaywrightConfig(): Promise<PlaywrightTestConfig | null>
	{
		const playwrightConfigPath = this.#getPlaywrightConfigPath();
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

	async #getUnitTestsBundle(options: { sourcemap?: boolean; file?: string } = {}): Promise<string>
	{
		const allTests = await this.#package.getUnitTests();
		const filteredTests = options.file
			? allTests.filter((filePath) => filePath.includes(path.basename(options.file)))
			: allTests;

		const sourceTestsCode = filteredTests
			.map((filePath) => {
				return `import '${filePath}';`;
			})
			.join('\n');

		const buildEngine = await PackageBuilder.getBuildEngine();
		const buildResult = await buildEngine.buildCode({
			code: sourceTestsCode,
			targets: this.#package.getTargets(),
			packageRoot: this.#package.getPath(),
			publicPath: this.#package.getPublicPath(),
			typescript: this.#package.isTypeScriptMode(),
			namespace: 'BX.TestsBundle',
			sourcemap: options.sourcemap,
		});

		return buildResult.code;
	}

	async runUnitTests(args: Record<string, any> = {}): Promise<any>
	{
		const playwrightConfig = await this.#getPlaywrightConfig();
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
				`/dev/ui/cli/mocha-wrapper.php?extension=${this.#package.getName()}`,
			);

			await page.goto(testsPage);

			const testsCodeBundle = await this.#getUnitTestsBundle({
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
		const playwrightConfig = await this.#getPlaywrightConfig();
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

		const tests = await this.#package.getEndToEndTests();
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

		const childProcess = spawn('npx', args, {
			stdio: 'inherit',
			cwd: Environment.getRoot(),
			env: {
				...global.process.env,
				TESTS_DIR: this.#package.getEndToEndTestsDirectoryPath(),
			},
		});

		return new Promise((resolve, reject) => {
			childProcess.on('close', (code) => {
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
