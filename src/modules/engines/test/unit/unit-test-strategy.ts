import type { UnitTestOptions, TestResult } from '../test-types';

export abstract class UnitTestStrategy
{
	abstract run(options: UnitTestOptions): Promise<TestResult>;
}
