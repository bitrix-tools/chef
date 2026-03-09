import type { TestStrategy } from './test-strategy';
import type {
	UnitTestOptions,
	E2ETestOptions,
	TestResult,
} from './test-types';

export class TestEngine
{
	protected readonly strategy: TestStrategy;

	constructor(strategy: TestStrategy)
	{
		this.strategy = strategy;
	}

	async runUnitTests(options: UnitTestOptions): Promise<TestResult>
	{
		return this.strategy.runUnitTests(options);
	}

	async runEndToEndTests(options: E2ETestOptions): Promise<TestResult>
	{
		return this.strategy.runEndToEndTests(options);
	}
}
