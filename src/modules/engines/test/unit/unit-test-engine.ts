import type { UnitTestStrategy } from './unit-test-strategy';
import type { UnitTestOptions, TestResult } from '../test-types';

export class UnitTestEngine
{
	readonly #strategy: UnitTestStrategy;

	constructor(strategy: UnitTestStrategy)
	{
		this.#strategy = strategy;
	}

	async run(options: UnitTestOptions): Promise<TestResult>
	{
		return this.#strategy.run(options);
	}
}
