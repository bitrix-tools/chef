import type { TestToken, ConsoleLog } from './test-types';

function escape(text: string): string
{
	return text
		.replace(/\|/g, '||')
		.replace(/'/g, "|'")
		.replace(/\n/g, '|n')
		.replace(/\r/g, '|r')
		.replace(/\[/g, '|[')
		.replace(/]/g, '|]');
}

function message(name: string, attrs: Record<string, string | number | boolean | undefined> = {}): string
{
	const parts = Object.entries(attrs)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${key}='${escape(String(value))}'`);

	if (parts.length === 0)
	{
		return `##teamcity[${name}]`;
	}

	return `##teamcity[${name} ${parts.join(' ')}]`;
}

function stringify(value: unknown): string
{
	if (typeof value === 'string')
	{
		return value;
	}

	return JSON.stringify(value, null, 2) ?? String(value);
}

export class TeamcityReporter
{
	#passed = 0;
	#failed = 0;
	#testCount = 0;
	#started = false;
	#suitePath: Map<string, string[]> = new Map();

	setBrowserCount(_count: number): void {}
	setTotalTests(_count: number): void {}
	setBrowsers(_names: string[]): void {}
	stop(): void {}
	updateStatus(_status: string, _browser?: string): void {}
	clearStatus(): void {}

	#write(text: string): void
	{
		process.stdout.write(text + '\n');
	}

	#ensureStarted(): void
	{
		if (!this.#started)
		{
			this.#started = true;
			this.#write(message('enteredTheMatrix'));
			this.#write(message('testingStarted'));
		}
	}

	#getSuitePath(browser?: string): string[]
	{
		const key = browser ?? '';
		let path = this.#suitePath.get(key);
		if (!path)
		{
			path = [];
			this.#suitePath.set(key, path);
		}
		return path;
	}

	#formatTestName(token: TestToken, browser?: string): string
	{
		const path = this.#getSuitePath(browser);
		const parts = [...path, token.title ?? ''];
		const fullName = parts.join(' > ');
		return browser ? `[${browser}] ${fullName}` : fullName;
	}

	handleToken(token: TestToken, browser?: string): void
	{
		this.#ensureStarted();

		if (token.id === 'SUITE_START' && !token.root)
		{
			this.#getSuitePath(browser).push(token.title ?? '');
		}

		if (token.id === 'SUITE_END' && !token.root)
		{
			this.#getSuitePath(browser).pop();
		}

		if (token.id === 'TEST_PASSED' || token.id === 'TEST_FAILED' || token.id === 'TEST_PENDING')
		{
			this.#testCount++;

			const name = this.#formatTestName(token, browser);

			this.#write(message('testStarted', { name }));

			if (token.id === 'TEST_FAILED')
			{
				this.#failed++;

				const details = token.error?.stack;
				const errorMessage = token.error?.message ?? '';

				if (token.showDiff && token.actual !== undefined && token.expected !== undefined)
				{
					this.#write(message('testFailed', {
						name,
						message: errorMessage,
						details,
						type: 'comparisonFailure',
						actual: stringify(token.actual),
						expected: stringify(token.expected),
					}));
				}
				else
				{
					this.#write(message('testFailed', {
						name,
						message: errorMessage,
						details,
					}));
				}
			}
			else if (token.id === 'TEST_PENDING')
			{
				this.#write(message('testIgnored', {
					name,
					message: 'skipped',
				}));
			}
			else
			{
				this.#passed++;
			}

			this.#write(message('testFinished', {
				name,
				duration: token.duration,
			}));
		}
	}

	finish(consoleLogs: ConsoleLog[] = []): { passed: number; failed: number; failures: never[]; browsers: never[] }
	{
		if (consoleLogs.length > 0)
		{
			for (const log of consoleLogs)
			{
				const prefix = log.type === 'error' ? 'ERROR'
					: log.type === 'warning' ? 'WARNING'
					: 'LOG';
				this.#write(`[${prefix}] ${log.text}`);
			}
		}

		if (this.#started)
		{
			this.#write(message('testingFinished'));
		}

		return { passed: this.#passed, failed: this.#failed, failures: [], browsers: [] };
	}
}
