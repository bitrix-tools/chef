import * as path from 'node:path';

export const fixturesPath = import.meta.dirname;
export const sourceRepo = path.join(fixturesPath, 'source-repo');
export const projectRepo = path.join(fixturesPath, 'project-repo');
export const expectedPath = path.join(fixturesPath, 'expected');

/**
 * Returns the absolute path to an extension inside the source-repo fixture.
 * By default, extensions are located under `ui/install/js/ui/`.
 */
export function extensionPath(name: string, module = 'ui'): string
{
	return path.join(sourceRepo, `${module}/install/js/${module}`, name);
}
