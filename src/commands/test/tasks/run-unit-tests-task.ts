import chalk from 'chalk';
import boxen from 'boxen';

import { createReporter } from '../create-reporter';
import { findPlaywrightConfig, getBrowsersFromConfig } from '../../../modules/engines/test/unit/playwright/find-playwright-config';
import { Environment } from '../../../environment/environment';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult, TaskDetail } from '../../../modules/task/task-types';
import type { BrowserType, ConsoleLog } from '../../../modules/engines/test/test-types';

const KNOWN_BROWSERS: Record<string, BrowserType> = {
	chromium: 'chromium',
	firefox: 'firefox',
	webkit: 'webkit',
};

const BROWSER_LABEL: Record<string, string> = {
	chromium: 'Chromium',
	firefox: 'Firefox',
	webkit: 'WebKit',
};

function createDebugTask(extension: BasePackage, args: Record<string, any>, browsers: string[]): Task
{
	const browserNames = browsers.map((b) => BROWSER_LABEL[b] ?? b);
	const browserList = browserNames.length === 1
		? browserNames[0]
		: browserNames.slice(0, -1).join(', ') + ' and ' + browserNames.at(-1);

	const debugMessage = [
		`${browserList} will open with ${chalk.bold('DevTools')} enabled.`,
		'',
		`${chalk.bold('What you can do:')}`,
		`  • Set breakpoints in source code and test files`,
		`  • Inspect DOM, network requests, and console output`,
		`  • Step through code using the ${chalk.bold('Sources')} panel`,
		`  • Sourcemaps are enabled — debug the original code, not the bundle`,
		'',
		`${chalk.bold('To finish:')} close the browser window or press ${chalk.bold('Ctrl+C')}`,
	].join('\n');

	return {
		title: 'Unit tests',
		run: async (onUpdate): Promise<TaskResult> => {
			console.log('');
			console.log(boxen(debugMessage, {
				padding: 1,
				borderStyle: 'round',
				borderColor: 'cyan',
				title: chalk.bold.cyan('Debug Mode'),
			}));

			for (const browserType of browsers)
			{
				const label = BROWSER_LABEL[browserType] ?? browserType;
				const reporter = createReporter(args.reporter, onUpdate);

				const testResult = await extension.runUnitTests({
					...args,
					browserType,
					onToken: (token) => reporter.handleToken(token),
				});

				if (testResult.errors.length > 0)
				{
					const details: TaskDetail[] = testResult.errors.map((error: Error) => ({
						type: 'error' as const,
						code: 'code' in error ? (error as any).code : undefined,
						message: error.message,
						stack: error.stack,
					}));

					return {
						title: `Unit tests (${label})`,
						status: 'failed',
						details,
					};
				}

				if (testResult.report.length > 0)
				{
					reporter.finish(testResult.consoleLogs);
				}

				if (testResult.debugCleanup)
				{
					await testResult.debugCleanup();
				}
			}

			return {
				title: 'Unit tests',
				status: 'passed',
			};
		},
	};
}

export function runUnitTestsTask(extension: BasePackage, args: Record<string, any>): Task
{
	const resolveBrowsers = async (): Promise<BrowserType[]> => {
		if (args.project)
		{
			const projects: string[] = Array.isArray(args.project) ? args.project : [args.project];
			return projects
				.map((project: string) => KNOWN_BROWSERS[project])
				.filter(Boolean);
		}

		const config = await findPlaywrightConfig(extension.getPath(), Environment.getRoot());
		return getBrowsersFromConfig(config);
	};

	if (args.debug)
	{
		return {
			title: 'Unit tests',
			run: async (onUpdate): Promise<TaskResult> => {
				const browsers = await resolveBrowsers();
				return createDebugTask(extension, args, browsers).run(onUpdate);
			},
		};
	}

	return {
		title: 'Unit tests',
		run: async (onUpdate): Promise<TaskResult> => {
			const browsers = await resolveBrowsers();
			const reporter = createReporter(args.reporter, onUpdate);
			reporter.setBrowserCount(browsers.length);
			const allConsoleLogs: ConsoleLog[] = [];
			const allErrors: Error[] = [];
			let hasTests = false;

			const promises = browsers.map(async (browserType) => {
				const label = BROWSER_LABEL[browserType] ?? browserType;

				const testResult = await extension.runUnitTests({
					...args,
					browserType,
					onToken: (token) => reporter.handleToken(token, label),
					onStatus: (status) => reporter.updateStatus(status, label),
				});

				if (testResult.errors.length > 0)
				{
					allErrors.push(...testResult.errors);
				}

				if (testResult.report.length > 0)
				{
					hasTests = true;
				}

				if (testResult.consoleLogs.length > 0)
				{
					allConsoleLogs.push(...testResult.consoleLogs);
				}
			});

			await Promise.all(promises);

			if (allErrors.length > 0)
			{
				const details: TaskDetail[] = allErrors.map((error) => ({
					type: 'error' as const,
					code: 'code' in error ? (error as any).code : undefined,
					message: error.message,
					stack: error.stack,
				}));
				console.log('');

				return {
					title: 'Unit tests',
					status: 'failed',
					details,
				};
			}

			if (!hasTests)
			{
				return {
					title: 'Unit tests',
					status: 'passed',
				};
			}

			const { failed } = reporter.finish(allConsoleLogs);

			return {
				title: 'Unit tests',
				status: failed === 0 ? 'passed' : 'failed',
			};
		},
	};
}
