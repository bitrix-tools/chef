import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { E2ETestStrategy } from '../e2e-test-strategy';
import { findPlaywrightConfig, getBrowsersFromConfig } from '../../unit/playwright/find-playwright-config';
import { ChefError } from '../../../../../diagnostics/chef-error';
import { CF } from '../../../../../diagnostics/diagnostic-codes';
import { parseTokenStream } from '../parse-token-stream';
import { createBrokenFileTokens } from '../../broken-file-tokens';
import { normalizePath } from '../../../../../utils/path/normalize';
import { escapeRegExp } from '../../../../../utils/escape-reg-exp';

import type {
	E2ETestOptions,
	TestResult,
	TestToken,
	ConsoleLog,
} from '../../test-types';

// A spec that failed to load: Playwright then runs none of the tests.
type BrokenSpecFile = {
	file: string;
	error: { message: string; stack?: string };
};

type RunError = {
	message: string;
	stack?: string;
	location?: { file: string; line: number; column: number };
};

type RunOnceResult = TestResult & {
	// Set when the run failed only because these specs failed to load.
	brokenFiles: BrokenSpecFile[];
};

const SPEC_FILE_PATTERN = /\.(spec|test)\.[cm]?[jt]sx?$/;

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

		// --list: Playwright enumerates tests (honoring --grep/--project) without running
		// them. The reporter is told via CHEF_LIST (see #runOnce env) to emit TEST_LISTED.
		if (options.listOnly)
		{
			baseArgs.push('--list');
		}

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
			// Normalize to NFC: a pattern pasted on macOS often arrives decomposed (NFD) —
			// e.g. "й" as "и"+combining breve — while the source titles are NFC. The two
			// look identical but the RegExp then matches nothing, silently filtering out
			// every test. NFC makes the pattern match the way the user sees it.
			baseArgs.push(`--grep=${options.grep.normalize('NFC')}`);
		}

		if (options.file)
		{
			baseArgs.push(options.file);
		}

		// Options chef does not own, routed here from the command line, appended last — so
		// one that chef also sets (say --output) is overridden by the user's, not the other
		// way round. chef never inspects these: unknown-to-chef options are exactly the
		// point, and validating them here would just re-create the gap they close.
		if (options.runnerArgs?.length)
		{
			baseArgs.push(...options.runnerArgs);
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

		// Excluding broken specs adds a file filter, and Playwright ORs file filters: next
		// to one the user (or the no-config testsDirectory argument) set it would widen the
		// run instead of narrowing it. Runner arguments are options only, never filters.
		// --list keeps reporting the load error as it is.
		const canExcludeBrokenFiles = Boolean(playwrightConfig) && !options.file && !options.listOnly;

		// Single process: an explicit single project, or the no-config fallback.
		if (projects.length <= 1)
		{
			const args = [...baseArgs];
			for (const project of projects)
			{
				args.push(`--project=${project}`);
			}

			const browser = projects[0] ? PlaywrightE2EStrategy.#formatBrowserName(projects[0]) : undefined;

			return this.#runExcludingBrokenFiles(args, options, { canExcludeBrokenFiles, browser });
		}

		// Sequential: one process per project, only one browser engine resident at a
		// time. Results are aggregated; the up-front total spans every project so the
		// progress counter ("N of total") still counts toward the full run.
		const aggregated: TestResult = { report: [], stats: {}, consoleLogs: [], errors: [] };
		const onBegin = options.onBegin ?? (() => {});
		let beganOnce = false;

		// Localized engine names in run order, for the status bar (done/running/waiting).
		const browserNames = projects.map((project) => PlaywrightE2EStrategy.#formatBrowserName(project));

		for (let index = 0; index < projects.length; index++)
		{
			const project = projects[index];
			const browserLabel = browserNames[index];
			const args = [...baseArgs, `--project=${project}`];

			// eslint-disable-next-line no-await-in-loop
			const result = await this.#runExcludingBrokenFiles(args, {
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
			}, { canExcludeBrokenFiles, browser: browserLabel, browserLabel });

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

	static #formatBrowserName(project: string): string
	{
		const labels: Record<string, string> = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' };

		return labels[project] ?? (project.charAt(0).toUpperCase() + project.slice(1));
	}

	// Playwright runs no test at all when any spec fails to load. Run again without the
	// broken specs, and report each of them as a failed entry named after the file.
	async #runExcludingBrokenFiles(
		args: string[],
		options: E2ETestOptions,
		run: { canExcludeBrokenFiles: boolean; browser?: string; browserLabel?: string },
	): Promise<TestResult>
	{
		const result = await this.#runOnce(args, options, run.browserLabel);
		if (!run.canExcludeBrokenFiles || result.brokenFiles.length === 0)
		{
			return result;
		}

		const brokenTokens = result.brokenFiles.flatMap((broken) => createBrokenFileTokens(
			PlaywrightE2EStrategy.#relativeToTests(broken.file, options.testsDirectory),
			'Failed to load',
			broken.error,
			run.browser,
		));

		// --pass-with-no-tests: when every spec is broken, nothing is left to run.
		const retry = await this.#runOnce(
			[...args, '--pass-with-no-tests', PlaywrightE2EStrategy.#excludeFilesFilter(result.brokenFiles)],
			{
				...options,
				// The broken entries are results too: count them so the summary adds up.
				onBegin: (info) => options.onBegin?.({ ...info, totalTests: info.totalTests + result.brokenFiles.length }),
			},
			run.browserLabel,
		);

		for (const token of brokenTokens)
		{
			retry.report.push(token);
			options.onToken?.(token, run.browser);
		}

		return retry;
	}

	// Positional arguments are regular expressions matched against absolute file paths
	// before the files are loaded; this one matches every file except the broken ones.
	static #excludeFilesFilter(brokenFiles: BrokenSpecFile[]): string
	{
		const files = brokenFiles.map((broken) => normalizePath(broken.file)
			.split('/')
			.map((segment) => escapeRegExp(segment))
			.join('[\\\\/]'));

		return `/^(?!.*(?:${files.join('|')})$)/`;
	}

	// Every run error must come from a spec that failed to load; otherwise the run failed
	// for another reason (global setup, config) and excluding files would not help.
	static #toBrokenFiles(runErrors: RunError[], testsDirectory: string): BrokenSpecFile[]
	{
		const brokenFiles = new Map<string, BrokenSpecFile>();

		for (const runError of runErrors)
		{
			// Follows from the load errors when no spec loaded at all.
			if (/^(Error: )?No tests found/.test(runError.message))
			{
				continue;
			}

			const file = runError.location?.file ?? PlaywrightE2EStrategy.#findSpecInStack(runError.stack, testsDirectory);
			if (!file)
			{
				return [];
			}

			if (brokenFiles.has(file))
			{
				continue;
			}

			// The message repeats the file path and ends with a code frame; the frame is
			// rendered from the location instead.
			const firstLine = runError.message.split('\n')[0].replace(`${file}: `, '');
			const location = runError.location
				? `    at ${file}:${runError.location.line}:${runError.location.column + 1}`
				: runError.stack;

			brokenFiles.set(file, {
				file,
				error: { message: firstLine, stack: location },
			});
		}

		return [...brokenFiles.values()];
	}

	static #findSpecInStack(stack: string | undefined, testsDirectory: string): string | null
	{
		for (const match of (stack ?? '').matchAll(/(?:\(|at )((?:[A-Za-z]:)?[\\/][^():\n]+):\d+:\d+/g))
		{
			const file = match[1];
			if (PlaywrightE2EStrategy.#findTestsDirectory(file, testsDirectory) && SPEC_FILE_PATTERN.test(file))
			{
				return file;
			}
		}

		return null;
	}

	static #relativeToTests(file: string, testsDirectory: string): string
	{
		const directory = PlaywrightE2EStrategy.#findTestsDirectory(file, testsDirectory) ?? testsDirectory;

		return normalizePath(path.relative(directory, file));
	}

	// Playwright reports real paths, while the tests directory may come through a symlink
	// (/var → /private/var on macOS): match the file against both forms.
	static #findTestsDirectory(file: string, testsDirectory: string): string | null
	{
		const directories = [testsDirectory];
		try
		{
			directories.push(fs.realpathSync(testsDirectory));
		}
		catch
		{
			// Not on disk: only the path as given can match.
		}

		return directories.find((directory) => normalizePath(file).startsWith(normalizePath(directory) + '/')) ?? null;
	}

	#runOnce(args: string[], options: E2ETestOptions, browserLabel?: string): Promise<RunOnceResult>
	{
		const onStatus = options.onStatus ?? (() => {});
		const onToken = options.onToken ?? (() => {});
		const onBegin = options.onBegin ?? (() => {});

		// Neutral "starting" message — works whether or not the tests authenticate.
		onStatus(browserLabel ? `Starting ${browserLabel}...` : 'Starting Playwright...');

		const childProcess = spawn('npx', args, {
			// Don't inherit stdin for a normal run: chef talks to Playwright over stdout
			// tokens, not the keyboard, and an inherited terminal lets Playwright flip the
			// tty into application-cursor-keys mode — which a Ctrl+C then leaves set, so the
			// shell shows "^[OA" for arrow keys afterwards. Only --debug (the Inspector) has
			// a reason to read the keyboard, so it keeps stdin.
			stdio: [options.debug ? 'inherit' : 'ignore', 'pipe', 'pipe'],
			cwd: options.projectRoot,
			env: {
				...global.process.env,
				TESTS_DIR: options.testsDirectory,
				...(options.listOnly ? { CHEF_LIST: '1' } : {}),
			},
			shell: process.platform === 'win32',
		});

		const report: TestToken[] = [];
		const consoleLogs: ConsoleLog[] = [];
		const errors: Error[] = [];
		const runErrors: RunError[] = [];
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
					runErrors.push({ message: event.message, stack: event.stack, location: event.location });
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
				resolve({ report, stats: {}, consoleLogs: [], errors, brokenFiles: [] });
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
					const details = runErrors.map((runError) => runError.stack || runError.message).join('\n\n').trim()
						|| consoleLogs.map((l) => l.text).join('\n').trim()
						|| stdoutTail.trim();
					const message = details
						? `Playwright exited with code ${code}:\n${details}`
						: `Playwright exited with code ${code}`;

					errors.push(PlaywrightE2EStrategy.#runError(message));
				}

				const failedToLoad = report.length === 0 && code !== 0 && runErrors.length > 0;

				resolve({
					report,
					stats: {},
					consoleLogs: report.length > 0 ? consoleLogs : [],
					errors,
					brokenFiles: failedToLoad ? PlaywrightE2EStrategy.#toBrokenFiles(runErrors, options.testsDirectory) : [],
					...(nodeMessages.length > 0 ? { nodeOutput: [{ browser: browserLabel, messages: nodeMessages }] } : {}),
				});
			});
		});
	}
}
