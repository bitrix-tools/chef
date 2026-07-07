import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult, TestError } from '@playwright/test/reporter';

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
		// Neutral, localized "Running <Browser>..." — used only for the early status
		// line before per-test results start streaming (the multi-browser status bar
		// takes over after that). We deliberately drop the raw "chromium: suite > test"
		// format, which looked out of place and leaked the lowercase project id.
		const browser = this.#formatBrowserName(test.titlePath()[1]);

		this.#emit({
			id: 'STATUS',
			text: browser ? `Running ${browser}...` : 'Running tests...',
		});
	}

	onTestEnd(test: TestCase, result: TestResult): void
	{
		const titlePath = test.titlePath();
		const browser = this.#formatBrowserName(titlePath[1]);
		const suitePath = titlePath.slice(2);
		const title = suitePath.pop() ?? '';

		// onTestEnd fires once per attempt, including retries. If this attempt failed
		// but another retry is coming, don't report a failure yet — the test isn't
		// done. We only emit a final token for the last attempt, so a test that fails
		// then passes on retry (flaky) is reported as passed, not failed.
		if (result.status !== 'passed' && result.status !== 'skipped' && result.retry < test.retries)
		{
			this.#emit({
				id: 'STATUS',
				text: browser ? `${browser}: retrying ${title}` : `retrying ${title}`,
			});
			return;
		}

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

	onStdOut(chunk: string | Buffer): void
	{
		this.#emitStdio(chunk);
	}

	onStdErr(chunk: string | Buffer): void
	{
		this.#emitStdio(chunk);
	}

	onError(error: TestError): void
	{
		// Run-level errors not tied to a single test — e.g. a spec that fails to compile
		// ("Cannot find module ..."), a global-setup throw, or "No tests found". With a
		// custom reporter Playwright routes these here instead of printing them, so we must
		// forward the message ourselves or the run would look empty with no explanation.
		this.#emit({
			id: 'RUN_ERROR',
			error: {
				message: error.message ?? error.value ?? 'Playwright run error',
				stack: error.stack,
			},
		});
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

	#emitStdio(chunk: string | Buffer): void
	{
		// Playwright captures a spec's stdout/stderr and routes it here instead of printing
		// it — so we forward it as a token. Base64 the text so newlines and any accidental
		// __CHEF_TOKEN__ substrings in the output can't corrupt the token stream.
		const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
		this.#emit({ id: 'STDIO', textBase64: Buffer.from(text, 'utf-8').toString('base64') });
	}

	#emit(data: Record<string, unknown>): void
	{
		process.stdout.write(`\n__CHEF_TOKEN__${JSON.stringify(data)}__CHEF_TOKEN__\n`);
	}
}
