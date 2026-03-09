import chalk from 'chalk';
import boxen from 'boxen';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { Task } from '../../../modules/task/task';
import type { ConsoleLog } from '../../../modules/engines/test/test-types';
import { TestReporter } from '../../../modules/engines/test/test-reporter';

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
		run: async (context): Promise<any> => {
			context.succeed('Unit tests');

			const reporter = new TestReporter();
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
				allErrors.forEach((error) => {
					context.border(error.message, 'red', 2);
				});
				console.log('');
				return false;
			}

			if (!hasTests)
			{
				return true;
			}

			const { failed } = reporter.finish(allConsoleLogs);

			return failed === 0;
		},
	};
}

function createDebugTask(extension: BasePackage, args: Record<string, any>, browsers: string[]): Task
{
	const browserTasks: Task[] = browsers.map((browserType) => {
		const label = BROWSER_LABEL[browserType] ?? browserType;

		return {
			title: label,
			run: async (context): Promise<any> => {
				const reporter = new TestReporter();

				context.succeed(label);

				const testResult = await extension.runUnitTests({
					...args,
					browserType,
					onToken: (token) => reporter.handleToken(token),
				});

				if (testResult.errors.length > 0)
				{
					testResult.errors.forEach((error: Error) => {
						context.border(error.message, 'red', 2);
					});
					return false;
				}

				if (testResult.report.length > 0)
				{
					reporter.finish(testResult.consoleLogs);
				}

				if (testResult.debugCleanup)
				{
					await testResult.debugCleanup();
				}

				return true;
			},
		};
	});

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
		run: async (context) => {
			context.succeed('Unit tests');
			console.log('');
			console.log(boxen(debugMessage, {
				padding: 1,
				borderStyle: 'round',
				borderColor: 'cyan',
				title: chalk.bold.cyan('Debug Mode'),
			}));
		},
		subtasks: browserTasks,
	};
}
