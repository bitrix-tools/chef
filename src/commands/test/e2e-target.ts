import { getModuleTests, getModuleTestsDirectory } from './module-tests-dir';
import { E2ETestEngine } from '../../modules/engines/test/e2e/e2e-test-engine';
import { PlaywrightE2EStrategy } from '../../modules/engines/test/e2e/playwright/playwright-e2e-strategy';
import { Environment } from '../../environment/environment';

import type { BasePackage } from '../../modules/packages/base-package';
import type { TestResult } from '../../modules/engines/test/test-types';

/**
 * The only thing that differs between running e2e tests for a single extension and for a
 * module's scenario suite: where the tests live and how to enumerate them. Everything
 * downstream (engine run, reporters, JSON) works against this shape and never needs to
 * know which kind of target it is — so extension and module tests share one code path.
 */
export type E2eTarget = {
	// Display name: extension name ("main.core") or module name ("crm").
	name: string;
	// Filesystem path shown to the user / put in JSON: the extension dir or the module tests dir.
	path: string;
	// Directory Playwright runs tests from.
	testsDirectory: string;
	// Absolute paths of the e2e test files (used for the "has tests" / "no test files" check).
	listTests: () => Promise<string[]>;
};

export function extensionTarget(extensionPackage: BasePackage): E2eTarget
{
	const testsDirectory = extensionPackage.getEndToEndTestsDirectoryPath();

	return {
		name: extensionPackage.getName(),
		path: extensionPackage.getPath(),
		testsDirectory,
		listTests: () => extensionPackage.getEndToEndTests(),
	};
}

export function moduleTarget(moduleName: string): E2eTarget
{
	const testsDirectory = getModuleTestsDirectory(moduleName);

	return {
		name: moduleName,
		path: testsDirectory,
		testsDirectory,
		listTests: () => getModuleTests(moduleName),
	};
}

/**
 * Single entry point for running e2e tests, whatever the target. Extension and module
 * runs used to have their own near-identical copy of this — now both go through here, so
 * the engine, options and streaming callbacks are wired the same way for both.
 */
export async function runE2eForTarget(target: E2eTarget, args: Record<string, any> = {}): Promise<TestResult>
{
	const engine = new E2ETestEngine(new PlaywrightE2EStrategy());
	const tests = await target.listTests();

	return engine.run({
		projectRoot: Environment.getRoot() ?? process.cwd(),
		testsDirectory: target.testsDirectory,
		hasTests: tests.length > 0,
		headed: args.headed,
		debug: args.debug,
		grep: args.grep,
		project: args.project,
		file: args.file,
		captureNodeOutput: args.captureNodeOutput,
		listOnly: args.listOnly,
		onToken: args.onToken,
		onStatus: args.onStatus,
		onBegin: args.onBegin,
	});
}
