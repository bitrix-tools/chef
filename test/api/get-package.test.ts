import { describe, it, beforeEach } from 'mocha';
import { assert } from 'chai';

import { getPackage } from '../../src/api/get-package';
import { Package } from '../../src/api/package';
import { PackageResolver } from '../../src/modules/packages/package-resolver';

import { sourceRepo } from '../fixtures/index';

describe('chef.getPackage', () => {
	beforeEach(() => {
		PackageResolver.clearCache();
	});

	it('returns a Package instance for an existing extension', async () => {
		const pkg = await getPackage('ui.buttons', { cwd: sourceRepo });

		assert.instanceOf(pkg, Package);
		assert.equal(pkg!.getName(), 'ui.buttons');
	});

	it('returns null for a non-existent extension', async () => {
		const pkg = await getPackage('nope.nope', { cwd: sourceRepo });

		assert.isNull(pkg);
	});

	it('returns null when cwd is invalid', async () => {
		const pkg = await getPackage('ui.buttons', { cwd: '/nonexistent' });

		assert.isNull(pkg);
	});

	it('does not throw on any failure path', async () => {
		// Various ways things could go wrong
		const a = await getPackage('', { cwd: sourceRepo });
		const b = await getPackage('ui.buttons', { cwd: '/nope' });
		const c = await getPackage('a.b.c.d.e', { cwd: sourceRepo });

		assert.isNull(a);
		assert.isNull(b);
		assert.isNull(c);
	});
});
