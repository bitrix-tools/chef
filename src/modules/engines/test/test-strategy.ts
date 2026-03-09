import type {
	UnitTestOptions,
	E2ETestOptions,
	TestResult,
} from './test-types';

export abstract class TestStrategy
{
	abstract runUnitTests(options: UnitTestOptions): Promise<TestResult>;
	abstract runEndToEndTests(options: E2ETestOptions): Promise<TestResult>;
}
