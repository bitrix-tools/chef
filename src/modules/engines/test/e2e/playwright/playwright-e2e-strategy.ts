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

		const playwrightConfig = await findPlaywrightConfig(options.testsDirectory, options.projectRoot)
			?? await findPlaywrightConfig(options.projectRoot, options.projectRoot);

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
		let stdoutBuffer = '';
		let totalTests = -1;

		childProcess.stdout.on('data', (data: Buffer) => {
			stdoutBuffer += data.toString();

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
			childProcess.on('close', (code) => {
				if (report.length === 0 && code !== 0 && totalTests !== 0)
				{
					const stderrText = consoleLogs.map((l) => l.text).join('\n').trim();
					errors.push(new ChefError(CF.PLAYWRIGHT_ERROR, stderrText || 'Playwright exited with errors'));
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
}
