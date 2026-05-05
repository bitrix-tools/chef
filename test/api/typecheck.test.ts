import { describe, it, beforeEach } from 'mocha';
import { assert } from 'chai';

import { typecheck } from '../../src/api/typecheck';
import { PackageResolver } from '../../src/modules/packages/package-resolver';
import { CF } from '../../src/diagnostics/diagnostic-codes';

import { sourceRepo } from '../fixtures/index';

describe('chef.typecheck', () => {
	beforeEach(() => {
		PackageResolver.clearCache();
	});

	it('returns ChefResult with required fields', async () => {
		const r = await typecheck({ cwd: sourceRepo, extension: 'definitely.nope' });

		assert.equal(r.command, 'typecheck');
		assert.hasAllKeys(r, ['ok', 'command', 'extensions', 'notFound', 'summary']);
	});

	it('marks JS extensions as skipped', async () => {
		const r = await typecheck({ cwd: sourceRepo, extension: 'ui.buttons' });

		assert.isTrue(r.ok);
		const ext = r.extensions[0];
		assert.isTrue(ext.details!.skipped);
		assert.isString(ext.details!.skipReason);
	});

	it('returns fatal error for invalid cwd', async () => {
		const r = await typecheck({ cwd: '/nope', extension: 'whatever' });

		assert.isFalse(r.ok);
		assert.equal(r.error!.code, CF.INVALID_CWD);
	});

	it('does not throw', async () => {
		await typecheck({ cwd: '/nope' });
		await typecheck({ cwd: sourceRepo, extension: 'x.y' });
		await typecheck({ cwd: sourceRepo, extension: 'a', path: 'b' });
	});
});
