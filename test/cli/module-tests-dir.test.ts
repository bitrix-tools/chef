import * as path from 'node:path';

import { describe, it, afterEach } from 'mocha';
import { assert } from 'chai';

import { getModuleTestsDirectory, getModuleTests } from '../../src/commands/test/module-tests-dir';
import { Environment } from '../../src/environment/environment';
import { sourceRepo, projectRepo } from './run-chef';

describe('module-tests-dir', () => {
	afterEach(() => {
		// Restore the environment context to the real cwd between cases.
		Environment.setContext(process.cwd());
	});

	it('resolves <module>/tests/chef/e2e in a source (module repo) environment', () => {
		Environment.setContext(sourceRepo);

		const dir = getModuleTestsDirectory('crm');

		assert.equal(dir, path.join(sourceRepo, 'crm', 'tests', 'chef', 'e2e'));
	});

	it('resolves local/modules/<module>/tests/chef/e2e on an installed Bitrix (project)', () => {
		Environment.setContext(projectRepo);

		const dir = getModuleTestsDirectory('mymod');

		// The read-only product `bitrix/` directory is intentionally not used.
		assert.equal(dir, path.join(projectRepo, 'local', 'modules', 'mymod', 'tests', 'chef', 'e2e'));
	});

	it('returns no test files for a module directory that does not exist', async () => {
		Environment.setContext(sourceRepo);

		const tests = await getModuleTests('definitely-not-a-real-module-xyz');

		assert.deepEqual(tests, []);
	});
});
