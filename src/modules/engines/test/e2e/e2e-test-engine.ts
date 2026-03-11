import type { E2ETestStrategy } from './e2e-test-strategy';
import type { E2ETestOptions, TestResult } from '../test-types';

export class E2ETestEngine
{
	readonly #strategy: E2ETestStrategy;

	constructor(strategy: E2ETestStrategy)
	{
		this.#strategy = strategy;
	}

	async run(options: E2ETestOptions): Promise<TestResult>
	{
		return this.#strategy.run(options);
	}
}
