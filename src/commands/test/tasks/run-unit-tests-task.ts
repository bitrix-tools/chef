import chalk from 'chalk';
import boxen from 'boxen';

import { createReporter } from '../create-reporter';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task, TaskResult, TaskDetail } from '../../../modules/task/task-types';
import type { ConsoleLog } from '../../../modules/engines/test/test-types';

const PROJECT_TO_BROWSER: Record<string, string> = {
	chromium: 'chromium',
	firefox: 'firefox',
	webkit: 'webkit',
};

const BROWSER_LABEL: Record<string, string> = {
	chromium: 'Chromium',
	firefox: 'Firefox',
	webkit: 'WebKit',
};

const DEFAULT_BROWSERS = ['chromium', 'firefox', 'webkit'];

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
		run: async (): Promise<TaskResult> => {
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
				const reporter = createReporter(args.reporter);

				const testResult = await extension.runUnitTests({
					...args,
					browserType,
					onToken: (token) => reporter.handleToken(token),
				});

				if (testResult.errors.length > 0)
				{
					const details: TaskDetail[] = testResult.errors.map((error: Error) => ({
						type: 'error' as const,
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
	const browsers = (() => {
		if (args.project)
		{
			const projects: string[] = Array.isArray(args.project) ? args.project : [args.project];
			return projects
				.map((project: string) => PROJECT_TO_BROWSER[project])
				.filter(Boolean);
		}

		return DEFAULT_BROWSERS;
	})();

	if (args.debug)
	{
		return createDebugTask(extension, args, browsers);
	}

	return {
		title: 'Unit tests',
		run: async (): Promise<TaskResult> => {
			const reporter = createReporter(args.reporter);
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
