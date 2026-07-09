import * as path from 'node:path';
import * as fs from 'node:fs';

import fg from 'fast-glob';

import { Environment } from '../../environment/environment';

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
