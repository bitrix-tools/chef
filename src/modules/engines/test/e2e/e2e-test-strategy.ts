import type { E2ETestOptions, TestResult } from '../test-types';

export abstract class E2ETestStrategy
{
	abstract run(options: E2ETestOptions): Promise<TestResult>;
}
