import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { E2ETestStrategy } from '../e2e-test-strategy';
import { findPlaywrightConfig } from '../../unit/playwright/find-playwright-config';
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

		const onStatus = options.onStatus ?? (() => {});
		const onToken = options.onToken ?? (() => {});
		const onBegin = options.onBegin ?? (() => {});
		const args = ['playwright', 'test', `--reporter=${STREAMING_REPORTER_PATH}`];

		const playwrightConfig = await findPlaywrightConfig(options.testsDirectory, options.projectRoot)
			?? await findPlaywrightConfig(options.projectRoot, options.projectRoot);

		if (!playwrightConfig)
		{
			args.push(options.testsDirectory);
		}

		if (!playwrightConfig?.outputDir)
		{
			args.push(`--output=${path.join(options.testsDirectory, 'test-results')}`);
		}

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
