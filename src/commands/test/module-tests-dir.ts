import * as path from 'node:path';
import * as fs from 'node:fs';

import fg from 'fast-glob';

import { Environment } from '../../environment/environment';
import { E2ETestEngine } from '../../modules/engines/test/e2e/e2e-test-engine';
import { PlaywrightE2EStrategy } from '../../modules/engines/test/e2e/playwright/playwright-e2e-strategy';

import type { TestResult } from '../../modules/engines/test/test-types';

/**
 * Scenario (cross-extension) e2e tests live at the MODULE level, in
 * `<module>/tests/chef/e2e/`, unlike per-extension tests under `install/js/...`.
 */
const MODULE_E2E_RELATIVE = path.join('tests', 'chef', 'e2e');

/**
 * Returns the directory that holds module sources for the current environment:
 * - source (module repo): the root itself, modules sit directly under it.
 * - project (installed Bitrix): `<root>/local/modules`. The product `bitrix/`
 *   directory is read-only and intentionally not searched.
 */
function getModulesBaseDirectory(): string
{
	const root = Environment.getRoot() ?? process.cwd();

	return Environment.getType() === 'project'
		? path.join(root, 'local', 'modules')
		: root;
}

/**
 * Resolves the scenario-tests directory for a module name, e.g.
 * `<root>/<module>/tests/chef/e2e` (source) or
 * `<root>/local/modules/<module>/tests/chef/e2e` (project).
 */
export function getModuleTestsDirectory(moduleName: string): string
{
	return path.join(getModulesBaseDirectory(), moduleName, MODULE_E2E_RELATIVE);
}

/**
 * Detects the module the current working directory belongs to: the first path
 * segment relative to the modules base directory. Returns null when cwd is
 * at/above that directory (no enclosing module).
 */
export function detectCurrentModule(): string | null
{
	if (!Environment.getRoot())
	{
		return null;
	}

	const relative = path.relative(getModulesBaseDirectory(), process.cwd());
	if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative))
	{
		return null;
	}

	const firstSegment = relative.split(path.sep)[0];
	return firstSegment || null;
}

/**
 * Lists e2e test files in a module's scenario-tests directory.
 * Returns [] when the directory does not exist.
 */
export async function getModuleTests(moduleName: string): Promise<string[]>
{
	const dir = getModuleTestsDirectory(moduleName);
	if (!fs.existsSync(dir))
	{
		return [];
	}

	return fg(['**/*.test.{js,ts}', '**/*.spec.{js,ts}'], {
		cwd: dir,
		absolute: true,
	});
}

/**
 * Runs a module's scenario e2e tests through the same engine and with the same
 * options as a single-extension e2e run (see PackageTestRunner.runEndToEndTests),
 * the only difference being the tests directory is a module directory rather than
 * an extension's. All run options (headed/debug/grep/project/file) and reporter
 * hooks are forwarded verbatim from `args`.
 */
export async function runModuleEndToEndTests(moduleName: string, args: Record<string, any> = {}): Promise<TestResult>
{
	const engine = new E2ETestEngine(new PlaywrightE2EStrategy());
	const tests = await getModuleTests(moduleName);

	return engine.run({
		projectRoot: Environment.getRoot() ?? process.cwd(),
		testsDirectory: getModuleTestsDirectory(moduleName),
		hasTests: tests.length > 0,
		headed: args.headed,
		debug: args.debug,
		grep: args.grep,
		project: args.project,
		file: args.file,
		captureNodeOutput: args.captureNodeOutput,
		onToken: args.onToken,
		onStatus: args.onStatus,
		onBegin: args.onBegin,
	});
}
