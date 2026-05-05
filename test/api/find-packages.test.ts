import * as path from 'node:path';

import { describe, it, beforeEach } from 'mocha';
import { assert } from 'chai';

import { findPackages } from '../../src/api/find-packages';
import { Package } from '../../src/api/package';
import { ChefError } from '../../src/diagnostics/chef-error';
import { PackageResolver } from '../../src/modules/packages/package-resolver';
import { CF } from '../../src/diagnostics/diagnostic-codes';

import { sourceRepo } from '../fixtures/index';

describe('chef.findPackages', () => {
	beforeEach(() => {
		PackageResolver.clearCache();
	});

	it('returns Package[] when extension matches', async () => {
		const packages = await findPackages({ cwd: sourceRepo, extension: 'ui.buttons' });

		assert.lengthOf(packages, 1);
		assert.instanceOf(packages[0], Package);
		assert.equal(packages[0].getName(), 'ui.buttons');
	});

	it('returns multiple packages by glob', async () => {
		const packages = await findPackages({ cwd: sourceRepo, extension: 'ui.circular-*' });
		const names = packages.map((p) => p.getName()).sort();

		assert.includeMembers(names, ['ui.circular-a', 'ui.circular-imports']);
	});

	it('returns packages found under a directory', async () => {
		const buttonsDir = path.join(sourceRepo, 'ui/install/js/ui/buttons');
		const packages = await findPackages({ cwd: sourceRepo, path: buttonsDir });

		assert.lengthOf(packages, 1);
		assert.equal(packages[0].getName(), 'ui.buttons');
	});

	it('returns all extensions when no selector is given', async () => {
		const packages = await findPackages({ cwd: sourceRepo });

		// fixture has many extensions
		assert.isAbove(packages.length, 5);
		for (const pkg of packages)
		{
			assert.instanceOf(pkg, Package);
		}
	});

	it('returns empty array when cwd is invalid', async () => {
		const packages = await findPackages({ cwd: '/nope' });

		assert.deepEqual(packages, []);
	});

	it('throws ChefError when both extension and path are given', async () => {
		try
		{
			await findPackages({ cwd: sourceRepo, extension: 'ui.buttons', path: '/tmp' });
			assert.fail('expected throw');
		}
		catch (error)
		{
			assert.instanceOf(error, ChefError);
			assert.equal((error as ChefError).code, CF.OPTION_DENIED);
		}
	});
});
