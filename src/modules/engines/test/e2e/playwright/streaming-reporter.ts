import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter';

export default class StreamingReporter implements Reporter
{
	onBegin(config: FullConfig, suite: Suite): void
	{
		const tests = suite.allTests();
		const projects = new Set(tests.map((t) => t.titlePath()[1]).filter(Boolean));

		this.#emit({
			id: 'BEGIN',
			totalTests: tests.length,
			browserCount: projects.size,
		});
	}

	onTestBegin(test: TestCase): void
	{
		const titlePath = test.titlePath();
		const project = titlePath[1] || '';
		const suitePath = titlePath.slice(2);
		const title = suitePath.pop() ?? '';
		const fullPath = [...suitePath, title].join(' > ');

		this.#emit({
			id: 'STATUS',
			text: project ? `${project}: ${fullPath}` : fullPath,
		});
	}

	onTestEnd(test: TestCase, result: TestResult): void
	{
		const titlePath = test.titlePath();
		const browser = this.#formatBrowserName(titlePath[1]);
		const suitePath = titlePath.slice(2);
		const title = suitePath.pop() ?? '';

		const errorMessage = result.errors
			?.map((e) => e.message)
			.filter(Boolean)
			.join('\n');

		const errorStack = result.errors
			?.map((e) => e.stack)
			.filter(Boolean)
			.join('\n');

		if (result.status === 'passed')
		{
			this.#emit({
				id: 'TEST_PASSED',
				suite: suitePath,
				title,
				browser,
				duration: result.duration,
			});
		}
		else if (result.status === 'skipped')
		{
			this.#emit({
				id: 'TEST_PENDING',
				suite: suitePath,
				title,
				browser,
			});
		}
		else
		{
			this.#emit({
				id: 'TEST_FAILED',
				suite: suitePath,
				title,
				browser,
				duration: result.duration,
				error: errorMessage ? { message: errorMessage, stack: errorStack || undefined } : undefined,
			});
		}
	}

	onEnd(result: FullResult): void
	{
		this.#emit({
			id: 'END',
			status: result.status,
			duration: result.duration,
		});
	}

	printsToStdio(): boolean
	{
		return true;
	}

	#formatBrowserName(name?: string): string | undefined
	{
		if (!name)
		{
			return undefined;
		}

		const labels: Record<string, string> = {
			chromium: 'Chromium',
			firefox: 'Firefox',
			webkit: 'WebKit',
		};

		return labels[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
	}

	#emit(data: Record<string, unknown>): void
	{
		process.stdout.write(`\n__CHEF_TOKEN__${JSON.stringify(data)}__CHEF_TOKEN__\n`);
	}
}
