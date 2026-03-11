import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import type { PlaywrightTestConfig } from '@playwright/test';
import type { SourceMap } from 'rollup';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { TestStrategy } from '../test-strategy';
import type {
	UnitTestOptions,
	E2ETestOptions,
	TestResult,
	TestToken,
	ConsoleLog,
} from '../test-types';
import { FileFinder } from '../../../../utils/file-finder';
import { PackageBuilder } from '../../../services/package-builder';

const STREAMING_REPORTER_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'streaming-reporter.ts',
);
const TOKEN_MARKER = '__CHEF_TOKEN__';

export class PlaywrightStrategy extends TestStrategy
{
	static #bundleCache = new Map<string, Promise<{ code: string; map: SourceMap | null }>>();

	#getPlaywrightConfigPath(packageRoot: string, projectRoot: string): string | null
	{
		const tsVersion = FileFinder.findUpFile({
			fileName: 'playwright.config.ts',
			fromDir: packageRoot,
			rootDir: projectRoot,
		});

		if (tsVersion)
		{
			return tsVersion;
		}

		return FileFinder.findUpFile({
			fileName: 'playwright.config.js',
			fromDir: packageRoot,
			rootDir: projectRoot,
		});
	}

	async #getPlaywrightConfig(packageRoot: string, projectRoot: string): Promise<PlaywrightTestConfig | null>
	{
		const configPath = this.#getPlaywrightConfigPath(packageRoot, projectRoot);
		if (configPath === null)
		{
			return null;
		}

		const configModule = await import(configPath);

		return (
			configModule.default.default
			|| configModule.default
			|| configModule
			|| null
		);
	}

	async #buildTestBundle(options: UnitTestOptions): Promise<{ code: string; map: SourceMap | null }>
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
			sourcemap: true,
		});

		return { code: buildResult.code, map: buildResult.map ?? null };
	}

	#getCachedBundle(options: UnitTestOptions): Promise<{ code: string; map: SourceMap | null }>
	{
		const cacheKey = options.packageRoot + ':' + (options.file ?? '');
		if (!PlaywrightStrategy.#bundleCache.has(cacheKey))
		{
			PlaywrightStrategy.#bundleCache.set(cacheKey, this.#buildTestBundle(options));
		}

		return PlaywrightStrategy.#bundleCache.get(cacheKey)!;
	}

	async runUnitTests(options: UnitTestOptions): Promise<TestResult>
	{
		const playwrightConfig = await this.#getPlaywrightConfig(options.packageRoot, options.projectRoot);
		if (playwrightConfig === null)
		{
			return {
				report: [],
				stats: {},
				consoleLogs: [],
				errors: [
					new Error('playwright.config.ts does not exist run `chef init test` for configure playwright'),
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
					new Error(`Unknown browser type: ${browserType}`),
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
						token.error.stack = this.#mapStack(token.error.stack, tracer);
					}
					report.push(token);
					options.onToken?.(token);
				}
				catch
				{
					// Skip malformed tokens
				}
			});

			const { code: testsCodeBundle, map: sourceMap } = await this.#getCachedBundle(options);

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
					timeout,
					inlineDiffs: true,
					color: true,
					...(grep ? { grep } : {}),
				});
			}, { grep, timeout });

			onStatus('Running tests...');

			const codeWithSourceMap = (() => {
				if (!sourceMap || !cdpPort)
				{
					return testsCodeBundle;
				}

				// Ensure sources use file:// URLs so PhpStorm can map them to local files
				const mapWithFileUrls = {
					...sourceMap,
					sources: (sourceMap.sources ?? []).map((source: string) => {
						if (source.startsWith('/'))
						{
							return `file://${source}`;
						}

						return source;
					}),
				};

				return testsCodeBundle
					+ '\n//# sourceURL=chef-test-bundle.js'
					+ '\n//# sourceMappingURL=data:application/json;base64,'
					+ Buffer.from(JSON.stringify(mapWithFileUrls)).toString('base64');
			})();

			if (cdpPort)
			{
				// Wait for external debugger to connect BEFORE injecting test scripts.
				// This ensures the debugger receives scriptParsed events and can bind breakpoints.
				const fs = await import('node:fs');
				const signalDir = '/tmp/chef-debug-signal';
				fs.mkdirSync(signalDir, { recursive: true });

				const readyFile = path.join(signalDir, 'ready');
				const runFile = path.join(signalDir, 'run');

				try { fs.unlinkSync(readyFile); } catch {}
				try { fs.unlinkSync(runFile); } catch {}

				// Signal that page is ready for debugger to connect
				fs.writeFileSync(readyFile, String(cdpPort));

				// Wait for debugger to connect
				await new Promise<void>((resolve) => {
					const check = () => {
						if (fs.existsSync(runFile))
						{
							try { fs.unlinkSync(readyFile); } catch {}
							try { fs.unlinkSync(runFile); } catch {}
							resolve();
							return;
						}
						setTimeout(check, 100);
					};
					check();
				});
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

	async runEndToEndTests(options: E2ETestOptions): Promise<TestResult>
	{
		if (!options.hasTests)
		{
			return {
				report: [],
				stats: {},
				consoleLogs: [],
				errors: [],
			};
		}

		const onStatus = options.onStatus ?? (() => {});
		const onToken = options.onToken ?? (() => {});
		const onBegin = options.onBegin ?? (() => {});
		const args = ['playwright', 'test', `--reporter=${STREAMING_REPORTER_PATH}`];

		if (options.headed)
		{
			args.push('--headed');
		}

		if (options.debug)
		{
			args.push('--debug');
		}

		if (options.grep)
		{
			args.push(`--grep=${options.grep}`);
		}

		if (options.project)
		{
			const projects = Array.isArray(options.project) ? options.project : [options.project];
			for (const project of projects)
			{
				args.push(`--project=${project}`);
			}
		}

		if (options.file)
		{
			args.push(options.file);
		}

		onStatus('Running Playwright...');

		const childProcess = spawn('npx', args, {
			stdio: ['inherit', 'pipe', 'pipe'],
			cwd: options.projectRoot,
			env: {
				...global.process.env,
				TESTS_DIR: options.testsDirectory,
			},
		});

		const report: TestToken[] = [];
		const consoleLogs: ConsoleLog[] = [];
		const errors: Error[] = [];
		let stdoutBuffer = '';

		childProcess.stdout.on('data', (data: Buffer) => {
			stdoutBuffer += data.toString();

			let startIdx: number;
			while ((startIdx = stdoutBuffer.indexOf(TOKEN_MARKER)) !== -1)
			{
				const endIdx = stdoutBuffer.indexOf(TOKEN_MARKER, startIdx + TOKEN_MARKER.length);
				if (endIdx === -1)
				{
					break;
				}

				const json = stdoutBuffer.slice(startIdx + TOKEN_MARKER.length, endIdx);
				stdoutBuffer = stdoutBuffer.slice(endIdx + TOKEN_MARKER.length);

				try
				{
					const data = JSON.parse(json);
					if (data.id === 'END')
					{
						continue;
					}

					if (data.id === 'BEGIN')
					{
						onBegin({ totalTests: data.totalTests, browserCount: data.browserCount });
						onStatus(`Running ${data.totalTests} tests...`);
						continue;
					}

					if (data.id === 'STATUS')
					{
						onStatus(data.text);
						continue;
					}

					const browser: string | undefined = data.browser || undefined;
					const token: TestToken = {
						id: data.id,
						title: data.title,
						suite: data.suite,
						duration: data.duration,
						error: data.error,
					};
					report.push(token);
					onToken(token, browser);
				}
				catch
				{
					// Skip malformed tokens
				}
			}
		});

		childProcess.stderr.on('data', (data: Buffer) => {
			const text = data.toString().trim();
			if (text)
			{
				consoleLogs.push({ type: 'error', text });
			}
		});

		return new Promise((resolve) => {
			childProcess.on('close', (code) => {
				if (report.length === 0 && code !== 0)
				{
					const stderrText = consoleLogs.map((l) => l.text).join('\n').trim();
					errors.push(new Error(stderrText || 'Playwright exited with errors'));
				}

				resolve({
					report,
					stats: {},
					consoleLogs: report.length > 0 ? consoleLogs : [],
					errors,
				});
			});
		});
	}

	#mapStack(stack: string, tracer: TraceMap): string
	{
		// Match bundle frames including the full URL prefix:
		// Chromium: "at fn (<anonymous>:53:13)"
		// Firefox: "@http://host/dev/ui/cli/mocha-wrapper.php:53:13"
		// WebKit: "http://host/dev/ui/cli/mocha-wrapper.php:53:13"
		const bundleFramePattern = /(?:https?:\/\/\S*)?(?:<anonymous>|injectedScript|mocha-wrapper\.php):(\d+):(\d+)/g;

		return stack.replace(bundleFramePattern, (match, lineStr: string, colStr: string) => {
			const line = Number(lineStr);
			const column = Number(colStr);

			const pos = originalPositionFor(tracer, { line, column });
			if (pos.source)
			{
				const source = pos.source.startsWith('/')
					? pos.source
					: path.resolve(pos.source);

				return `${source}:${pos.line}:${pos.column + 1}`;
			}

			return match;
		});
	}
}
