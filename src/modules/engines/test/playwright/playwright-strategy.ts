import * as path from 'node:path';
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

export class PlaywrightStrategy extends TestStrategy
{
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

		const isDebug = !!options.debug;
		const browser = await browserLauncher.launch({
			headless: isDebug ? false : !options.headed,
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
				`/dev/ui/cli/mocha-wrapper.php?extension=${options.packageName}`,
			);

			await page.goto(testsPage);

			const { code: testsCodeBundle, map: sourceMap } = await this.#buildTestBundle(options);
			const tracer = sourceMap ? new TraceMap(sourceMap as any) : null;

			const report: TestToken[] = [];
			const consoleLogs: ConsoleLog[] = [];

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
							const token = JSON.parse(value);
							if (token.id === 'TEST_FAILED' && token.error?.stack && tracer)
							{
								token.error.stack = this.#mapStack(token.error.stack, tracer);
							}
							report.push(token);
							options.onToken?.(token);
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

		const args = ['playwright', 'test', '--reporter=json'];

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

		const childProcess = spawn('npx', args, {
			stdio: ['inherit', 'pipe', 'pipe'],
			cwd: options.projectRoot,
			env: {
				...global.process.env,
				TESTS_DIR: options.testsDirectory,
			},
		});

		const stdout: string[] = [];
		const stderr: string[] = [];

		childProcess.stdout.on('data', (data: Buffer) => {
			stdout.push(data.toString());
		});

		childProcess.stderr.on('data', (data: Buffer) => {
			stderr.push(data.toString());
		});

		return new Promise((resolve) => {
			childProcess.on('close', () => {
				const jsonOutput = stdout.join('');

				try
				{
					const playwrightReport = JSON.parse(jsonOutput);
					const report = this.#convertPlaywrightReport(playwrightReport);
					const consoleLogs: ConsoleLog[] = [];

					if (stderr.length > 0)
					{
						const stderrText = stderr.join('').trim();
						if (stderrText)
						{
							consoleLogs.push({ type: 'error', text: stderrText });
						}
					}

					resolve({
						report,
						stats: playwrightReport.stats ?? {},
						consoleLogs,
						errors: (playwrightReport.errors ?? []).map(
							(error: { message: string }) => new Error(error.message),
						),
					});
				}
				catch
				{
					resolve({
						report: [],
						stats: {},
						consoleLogs: [],
						errors: [new Error(jsonOutput || stderr.join('') || 'Failed to parse Playwright JSON report')],
					});
				}
			});
		});
	}

	#convertPlaywrightReport(report: PlaywrightJsonReport): TestToken[]
	{
		const tokens: TestToken[] = [];
		this.#convertSuites(report.suites ?? [], tokens);

		return tokens;
	}

	#convertSuites(suites: PlaywrightSuite[], tokens: TestToken[]): void
	{
		for (const suite of suites)
		{
			tokens.push({ id: 'SUITE_START', title: suite.title });

			for (const spec of (suite.specs ?? []))
			{
				const test = spec.tests?.[0];
				const result = test?.results?.[0];

				if (!result)
				{
					tokens.push({ id: 'TEST_PENDING', title: spec.title });
					continue;
				}

				if (result.status === 'passed')
				{
					tokens.push({
						id: 'TEST_PASSED',
						title: spec.title,
						duration: result.duration,
					});
				}
				else if (result.status === 'skipped')
				{
					tokens.push({ id: 'TEST_PENDING', title: spec.title });
				}
				else
				{
					const errorMessage = result.errors
						?.map((e: { message?: string }) => e.message)
						.filter(Boolean)
						.join('\n');

					tokens.push({
						id: 'TEST_FAILED',
						title: spec.title,
						duration: result.duration,
						error: errorMessage ? { message: errorMessage } : undefined,
					});
				}
			}

			this.#convertSuites(suite.suites ?? [], tokens);

			tokens.push({ id: 'SUITE_END', title: suite.title });
		}
	}

	#mapStack(stack: string, tracer: TraceMap): string
	{
		// Match location patterns in stack traces across browsers:
		// Chromium: "at fn (<anonymous>:53:13)"
		// Firefox: "@http://url:53:13" or "fn@http://url:53:13"
		// WebKit: "@url line 7 > injectedScript:53:13"
		const framePattern = /(?:<anonymous>|[^\s()]+):(\d+):(\d+)/g;

		return stack.replace(framePattern, (match, lineStr: string, colStr: string) => {
			const line = Number(lineStr);
			const column = Number(colStr);

			const pos = originalPositionFor(tracer, { line, column });
			if (pos.source)
			{
				const source = pos.source.startsWith('/')
					? pos.source
					: path.resolve(pos.source);

				return `${source}:${pos.line}:${pos.column}`;
			}

			return match;
		});
	}
}

type PlaywrightJsonReport = {
	suites?: PlaywrightSuite[];
	stats?: Record<string, unknown>;
	errors?: Array<{ message: string }>;
};

type PlaywrightSuite = {
	title: string;
	specs?: PlaywrightSpec[];
	suites?: PlaywrightSuite[];
};

type PlaywrightSpec = {
	title: string;
	tests?: Array<{
		results?: Array<{
			status: string;
			duration: number;
			errors?: Array<{ message?: string }>;
		}>;
	}>;
};
