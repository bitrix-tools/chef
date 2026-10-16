import type { TestToken } from './test-types';

/**
 * Tokens for a test file that failed to build or load: a suite named after the file with
 * one failed entry in it ("Failed to build"). Reported like this, the file reads as a group
 * heading in the terminal, and the JSON and TeamCity reporters, which take the suite path
 * from SUITE_START/SUITE_END, name the entry after the file too.
 */
export function createBrokenFileTokens(
	file: string,
	title: string,
	error: { message: string; stack?: string },
	browser?: string,
): TestToken[]
{
	return [
		{ id: 'SUITE_START', title: file, browser },
		{ id: 'TEST_FAILED', title, suite: [file], error, browser },
		{ id: 'SUITE_END', title: file, browser },
	];
}
