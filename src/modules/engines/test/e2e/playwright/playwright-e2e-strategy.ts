import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { E2ETestStrategy } from '../e2e-test-strategy';
import { findPlaywrightConfig, getBrowsersFromConfig } from '../../unit/playwright/find-playwright-config';
import { ChefError } from '../../../../../diagnostics/chef-error';
import { CF } from '../../../../../diagnostics/diagnostic-codes';
import { parseTokenStream } from '../parse-token-stream';

import type {
	E2ETestOptions,
	TestResult,
	TestToken,
	ConsoleLog,
} from '../../test-types';

const STREAMING_REPORTER_DIR = path.dirname(fileURLToPath(import.meta.url));
const STREAMING_REPORTER_PATH = fs.existsSync(path.resolve(STREAMING_REPORTER_DIR, 'streaming-reporter.ts'))
	? path.resolve(STREAMING_REPORTER_DIR, 'streaming-reporter.ts')
	: path.resolve(STREAMING_REPORTER_DIR, 'streaming-reporter.js');

export class PlaywrightE2EStrategy extends E2ETestStrategy
{
	// Run-level errors carry their full diagnostic in the message (esbuild/Playwright
	// already include the file and location). The JS stack would point at this line —
	// where the ChefError is constructed — which is meaningless to the user and makes the
	// reporter's code-frame highlight chef's own source instead of the real cause. Drop it.
	static #runError(message: string): ChefError
	{
		const error = new ChefError(CF.PLAYWRIGHT_ERROR, message);
		error.stack = undefined;

		return error;
	}

	async run(options: E2ETestOptions): Promise<TestResult>
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

		const baseArgs = ['playwright', 'test', `--reporter=${STREAMING_REPORTER_PATH}`];

		let playwrightConfig;
		try
		{
			playwrightConfig = await findPlaywrightConfig(options.testsDirectory, options.projectRoot)
				?? await findPlaywrightConfig(options.projectRoot, options.projectRoot);
		}
		catch (error)
		{
			// A playwright.config.{ts,js} that fails to load (syntax error, missing import,
			// throwing top-level code) must surface as a real error — not be swallowed into
			// an empty run that reads as "no tests collected".
			const reason = error instanceof Error ? error.message : String(error);

			return {
				report: [],
				stats: {},
				consoleLogs: [],
				errors: [PlaywrightE2EStrategy.#runError(`Failed to load Playwright config: ${reason}`)],
			};
		}

		if (!playwrightConfig)
		{
			baseArgs.push(options.testsDirectory);
		}

		if (!playwrightConfig?.outputDir)
		{
			baseArgs.push(`--output=${path.join(options.testsDirectory, 'test-results')}`);
		}

		if (options.headed)
		{
			baseArgs.push('--headed');
		}

		if (options.debug)
		{
			baseArgs.push('--debug');
		}

		if (options.grep)
		{
			baseArgs.push(`--grep=${options.grep}`);
		}

		if (options.file)
		{
			baseArgs.push(options.file);
		}

		// Decide which browser projects to run, and in how many separate processes.
		// Running every project inside ONE `playwright test` keeps all browser engines
		// alive at once; on a memory-constrained box that exhausts RAM and crashes
		// browsers (page closed, blank squares). Each engine on its own is stable, so
		// when no explicit --project is given we run the config's projects one at a
		// time in separate processes — only one engine is ever resident.
		let projects: string[];
		if (options.project)
		{
			projects = Array.isArray(options.project) ? options.project : [options.project];
		}
		else if (playwrightConfig)
		{
			projects = getBrowsersFromConfig(playwrightConfig);
		}
		else
		{
			// No config to enumerate projects from: let Playwright pick its defaults
			// in a single process (its own concurrency applies).
			projects = [];
		}

		// Single process: an explicit single project, or the no-config fallback.
		if (projects.length <= 1)
		{
			const args = [...baseArgs];
			for (const project of projects)
			{
				args.push(`--project=${project}`);
			}

			return this.#runOnce(args, options);
		}

		// Sequential: one process per project, only one browser engine resident at a
		// time. Results are aggregated; the up-front total spans every project so the
		// progress counter ("N of total") still counts toward the full run.
		const aggregated: TestResult = { report: [], stats: {}, consoleLogs: [], errors: [] };
		const onBegin = options.onBegin ?? (() => {});
		let beganOnce = false;

		// Localized engine names in run order, for the status bar (done/running/waiting).
		const browserLabels: Record<string, string> = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' };
		const browserNames = projects.map((p) => browserLabels[p] ?? (p.charAt(0).toUpperCase() + p.slice(1)));

		for (let index = 0; index < projects.length; index++)
		{
			const project = projects[index];
			const browserLabel = browserNames[index];
			const args = [...baseArgs, `--project=${project}`];

			// eslint-disable-next-line no-await-in-loop
			const result = await this.#runOnce(args, {
				...options,
				// The reporter de-duplicates a test across browsers (it counts unique
				// tests, not per-browser runs), so the progress total must be the
				// per-project test count, NOT multiplied by the project count — the
				// specs are identical across projects. Emit onBegin only once.
				//
				// browserCount = 1: because we run engines sequentially (one process
				// per project), at any moment only ONE browser is producing results.
				// Reporting it as the project count made the reporter wait for all
				// engines on every test line — so a test that already passed in
				// Chromium stayed greyed-out ("◌") for the whole run instead of showing
				// "✓ [Chromium]" immediately. With 1, each result is shown as soon as
				// its engine finishes it, tagged with that browser.
				onBegin: ({ totalTests }) => {
					if (!beganOnce)
					{
						beganOnce = true;
						onBegin({
							totalTests,
							browserCount: 1,
							browsers: browserNames,
						});
					}
				},
			}, browserLabel);

			aggregated.report.push(...result.report);
			aggregated.consoleLogs.push(...result.consoleLogs);
			aggregated.errors.push(...result.errors);

			if (result.nodeOutput?.length)
			{
				// Keep one section per engine (the label is set from this project) so the
				// reporter can group the output by browser, like a real console.
				(aggregated.nodeOutput ??= []).push(
					...result.nodeOutput.map((section) => ({ ...section, browser: browserLabel })),
				);
			}
		}

		return aggregated;
	}

	#runOnce(args: string[], options: E2ETestOptions, browserLabel?: string): Promise<TestResult>
	{
		const onStatus = options.onStatus ?? (() => {});
		const onToken = options.onToken ?? (() => {});
		const onBegin = options.onBegin ?? (() => {});

		// Neutral "starting" message — works whether or not the tests authenticate.
		onStatus(browserLabel ? `Starting ${browserLabel}...` : 'Starting Playwright...');

		const childProcess = spawn('npx', args, {
			stdio: ['inherit', 'pipe', 'pipe'],
			cwd: options.projectRoot,
			env: {
				...global.process.env,
				TESTS_DIR: options.testsDirectory,
			},
			shell: process.platform === 'win32',
		});

		const report: TestToken[] = [];
		const consoleLogs: ConsoleLog[] = [];
		const errors: Error[] = [];
		const runErrors: string[] = [];
		const nodeMessages: string[] = [];
		let stdoutBuffer = '';
		let totalTests = -1;
		let stdoutTail = '';

		childProcess.stdout.on('data', (data: Buffer) => {
			const chunk = data.toString();
			stdoutBuffer += chunk;

			// Keep a rolling tail of human-readable stdout so a crash before any token still
			// has context to report (Playwright prints load/build errors to stdout, not only
			// stderr). Strip the token markers so the tail carries the real message — e.g.
			// "Cannot find module ..." — instead of a dump of __CHEF_TOKEN__ JSON.
			const humanText = chunk.replace(/\n?__CHEF_TOKEN__.*?__CHEF_TOKEN__\n?/gs, '');
			stdoutTail = (stdoutTail + humanText).slice(-4000);

			const { events, remaining } = parseTokenStream(stdoutBuffer);
			stdoutBuffer = remaining;

			for (const event of events)
			{
				if (event.type === 'begin')
				{
					totalTests = event.totalTests;
					onBegin({ totalTests: event.totalTests, browserCount: event.browserCount });
					onStatus(`Running ${event.totalTests} tests...`);
				}
				else if (event.type === 'status')
				{
					onStatus(event.text);
				}
				else if (event.type === 'runError')
				{
					// A run-level failure the reporter captured (spec that won't compile,
					// global-setup throw, "No tests found"). Keep the real reason so it can
					// be reported instead of a bare exit code.
					runErrors.push(event.stack || event.message);
				}
				else if (event.type === 'stdio')
				{
					// The spec's own stdout/stderr, captured by Playwright and forwarded by
					// our reporter — one event per console.* call. Keep them separate (only
					// when requested) so the reporter can delimit each message on a green run.
					if (options.captureNodeOutput)
					{
						const message = event.text.replace(/\n+$/, '');
						if (message !== '')
						{
							nodeMessages.push(message);
						}
					}
				}
				else if (event.type === 'token')
				{
					if (event.browser && !event.token.browser)
					{
						event.token.browser = event.browser;
					}
					report.push(event.token);
					onToken(event.token, event.browser);
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
			// The process failed to even start (npx missing, permissions, ENOENT). Without
			// this handler the 'error' event would either crash chef or leave the promise
			// pending — the user would never learn why the run produced no tests.
			childProcess.on('error', (spawnError: Error) => {
				errors.push(PlaywrightE2EStrategy.#runError(`Failed to start Playwright: ${spawnError.message}`));
				resolve({ report, stats: {}, consoleLogs: [], errors });
			});

			childProcess.on('close', (code) => {
				// A non-zero exit with no collected results is always a real failure —
				// broken config, crash on load, wrong testDir. We reach #runOnce only when
				// test files exist (see run()'s hasTests guard), so "no tests" here is not
				// a benign empty run: report it instead of masking it as "no tests collected".
				if (report.length === 0 && code !== 0)
				{
					// Prefer the reporter-captured run error (real reason, e.g. a compile
					// failure) — with a custom reporter Playwright routes those through
					// onError instead of printing them. Fall back to stderr, then to the
					// (token-stripped) stdout tail, then to a bare exit code.
					const details = runErrors.join('\n\n').trim()
						|| consoleLogs.map((l) => l.text).join('\n').trim()
						|| stdoutTail.trim();
					const message = details
						? `Playwright exited with code ${code}:\n${details}`
						: `Playwright exited with code ${code}`;

					errors.push(PlaywrightE2EStrategy.#runError(message));
				}

				resolve({
					report,
					stats: {},
					consoleLogs: report.length > 0 ? consoleLogs : [],
					errors,
					...(nodeMessages.length > 0 ? { nodeOutput: [{ browser: browserLabel, messages: nodeMessages }] } : {}),
				});
			});
		});
	}
}
