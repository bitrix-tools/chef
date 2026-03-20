import * as path from 'node:path';

import { TraceMap } from '@jridgewell/trace-mapping';

import { UnitTestStrategy } from '../unit-test-strategy';
import { PackageBuilder } from '../../../../services/package-builder';
import { ChefError } from '../../../../../diagnostics/chef-error';
import { CF } from '../../../../../diagnostics/diagnostic-codes';
import { findPlaywrightConfig } from './find-playwright-config';
import { mapStack } from './map-stack';
import { embedSourceMap } from './embed-source-map';
import { signalReady, waitForDebugger } from './debug-signal';

import type { SourceMap } from 'rollup';
import type {
	UnitTestOptions,
	TestResult,
	TestToken,
	ConsoleLog,
} from '../../test-types';

type TestBundle = {
	code: string;
	map: SourceMap | null;
	css: string;
};

export class PlaywrightUnitStrategy extends UnitTestStrategy
{
	static #bundleCache = new Map<string, Promise<TestBundle>>();

	static clearBundleCache(): void
	{
		PlaywrightUnitStrategy.#bundleCache.clear();
	}

	async #buildTestBundle(options: UnitTestOptions): Promise<TestBundle>
	{
		const filteredTests = options.file
			? options.testFiles.filter((filePath) => filePath.includes(path.basename(options.file)))
			: options.testFiles;

		const sourceTestsCode = filteredTests
			.map((filePath) => `import '${filePath}';`)
			.join('\n');

		const buildEngine = await PackageBuilder.getBuildEngine();
		const buildResult = await buildEngine.buildCode({
			code: sourceTestsCode,
			targets: options.targets,
			packageRoot: options.packageRoot,
			publicPath: options.publicPath,
			typescript: options.typescript,
			namespace: 'BX.TestsBundle',
			standalone: true,
			sourcemap: true,
		});

		return {
			code: buildResult.code,
			map: buildResult.map ?? null,
			css: buildResult.css,
		};
	}

	#getCachedBundle(options: UnitTestOptions): Promise<TestBundle>
	{
		const cacheKey = options.packageRoot + ':' + (options.file ?? '');
		if (!PlaywrightUnitStrategy.#bundleCache.has(cacheKey))
		{
			PlaywrightUnitStrategy.#bundleCache.set(cacheKey, this.#buildTestBundle(options));
		}

		return PlaywrightUnitStrategy.#bundleCache.get(cacheKey)!;
	}

	async run(options: UnitTestOptions): Promise<TestResult>
	{
		const playwrightConfig = await findPlaywrightConfig(options.packageRoot, options.projectRoot);
		if (playwrightConfig === null)
		{
			return {
				report: [],
				stats: {},
				consoleLogs: [],
				errors: [
					new ChefError(CF.PLAYWRIGHT_CONFIG_NOT_FOUND, 'playwright.config.ts not found. Run `chef init tests` to set up the test environment.'),
				],
			};
		}

		const browserType = options.browserType ?? 'chromium';
		const onStatus = options.onStatus ?? (() => {});

		onStatus('Loading Playwright...');
		const playwright = await import('playwright');
		const browserLauncher = playwright[browserType];
		if (!browserLauncher)
		{
			return {
				report: [],
				stats: {},
				consoleLogs: [],
				errors: [
					new ChefError(CF.UNKNOWN_BROWSER, `Unknown browser type: ${browserType}`),
				],
			};
		}

		onStatus(`Launching ${browserType}...`);
		const isDebug = !!options.debug;
		const cdpPort = options.cdpPort;

		let browser;
		if (cdpPort && browserType === 'chromium')
		{
			// Launch Chromium with CDP port, then connect Playwright to it.
			// We can't pass --remote-debugging-port to Playwright's launch()
			// because Playwright uses its own CDP pipe which conflicts.
			const chromiumPath = browserLauncher.executablePath();
			const { spawn } = await import('node:child_process');
			const chromiumProcess = spawn(chromiumPath, [
				`--remote-debugging-port=${cdpPort}`,
				'--no-first-run',
				'--no-default-browser-check',
				`--user-data-dir=${(await import('node:os')).tmpdir()}/chef-debug-${Date.now()}`,
			], { stdio: 'ignore' });

			// Wait for CDP port to be ready
			await new Promise<void>((resolve) => {
				const check = async () => {
					try
					{
						const response = await fetch(`http://localhost:${cdpPort}/json/version`);
						if (response.ok)
						{
							resolve();
							return;
						}
					}
					catch
					{
						// Port not ready yet
					}
					setTimeout(check, 100);
				};

				check();
			});

			browser = await browserLauncher.connectOverCDP(`http://localhost:${cdpPort}`);

			// Ensure Chromium process is killed when browser disconnects
			browser.on('disconnected', () => {
				chromiumProcess.kill();
			});
		}
		else
		{
			browser = await browserLauncher.launch({
				headless: isDebug ? false : !options.headed,
				...(isDebug ? {
					slowMo: 250,
					devtools: true,
					args: ['--auto-open-devtools-for-tabs'],
				} : {}),
			});
		}

		const context = cdpPort
			? browser.contexts()[0] ?? await browser.newContext()
			: await browser.newContext();
		const page = context.pages()[0] ?? await context.newPage();

		const report: TestToken[] = [];
		const consoleLogs: ConsoleLog[] = [];
		let tracer: TraceMap | null = null;

		try
		{
			onStatus('Building test bundle...');

			// Expose function for browser to send tokens directly via CDP
			await page.exposeFunction('__chefSendToken', (data: string) => {
				try
				{
					const token = JSON.parse(data) as TestToken;
					if (token.id === 'TEST_FAILED' && token.error?.stack && tracer)
					{
						token.error.stack = mapStack(token.error.stack, tracer);
					}
					report.push(token);
					options.onToken?.(token);
				}
				catch
				{
					// Skip malformed tokens
				}
			});

			const { code: testsCodeBundle, map: sourceMap, css } = await this.#getCachedBundle(options);

			tracer = sourceMap ? new TraceMap(sourceMap as any) : null;

			const testsPageUrl = new URL('/dev/ui/cli/mocha-wrapper.php', playwrightConfig.use.baseURL);
			testsPageUrl.searchParams.set('extension', options.packageName);

			onStatus('Loading test page...');
			await page.goto(testsPageUrl.toString());

			// Close extra pages (about:blank) so CDP /json only shows the test page.
			// This prevents WipRemoteVmConnection from connecting to the wrong page.
			if (cdpPort)
			{
				for (const p of context.pages())
				{
					if (p !== page)
					{
						await p.close();
					}
				}
			}

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

					const type = message.type();
					consoleLogs.push({ type, text: values.join(' ') });
				}
				catch (err)
				{
					consoleLogs.push({ type: 'error', text: `[console capture error: ${err}]` });
				}
			});

			const grep = options.grep ?? null;
			const timeout = isDebug ? 60000 : 10000;

			await page.evaluate(({ grep, timeout }) => {
				// @ts-ignore
				globalThis.mocha.setup({
					ui: 'bdd',
					// @ts-ignore
					reporter: ProxyReporter,
					checkLeaks: true,
					globals: [
						// Vue 3 creates these globals when first mounted
						'__VUE__',
						'__VUE_DEVTOOLS_HOOK_REPLAY__',
					],
					timeout,
					inlineDiffs: true,
					color: true,
					...(grep ? { grep } : {}),
				});
			}, { grep, timeout });

			onStatus('Running tests...');

			const codeWithSourceMap = sourceMap && cdpPort
				? embedSourceMap(testsCodeBundle, sourceMap)
				: testsCodeBundle;

			if (cdpPort)
			{
				// Wait for external debugger to connect BEFORE injecting test scripts.
				// This ensures the debugger receives scriptParsed events and can bind breakpoints.
				signalReady(cdpPort);
				await waitForDebugger();
			}

			if (css)
			{
				await page.addStyleTag({ content: css });
			}

			// Inject test scripts (after debugger is connected when cdpPort is set)
			await page.addScriptTag({
				content: codeWithSourceMap,
			});

			type TestStats = Promise<{ stats: any }>;

			const { stats } = await page.evaluate((): TestStats => {
				return new Promise((resolve) => {
					// @ts-ignore
					globalThis.mocha.run(() => {
						// @ts-ignore
						resolve({ stats: globalThis.mocha.stats });
					});
				});
			});

			// Tokens arrive via exposeFunction (CDP) — already received by this point

			const keepOpen = isDebug || !!cdpPort;

			if (!keepOpen)
			{
				await browser.close();
			}

			const debugCleanup = keepOpen
				? async () => {
					// Keep the Node.js event loop alive while waiting
					const keepAlive = setInterval(() => {}, 30_000);

					await new Promise<void>((resolve) => {
						const cleanup = async () => {
							clearInterval(keepAlive);
							resolve();
						};

						browser.on('disconnected', cleanup);
						page.on('close', cleanup);
						process.on('SIGINT', async () => {
							await browser.close();
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
				stats: {},
				consoleLogs: [],
				errors: [error instanceof Error ? error : new Error(String(error))],
			};
		}
	}

}
