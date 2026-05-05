import { describe, it, beforeEach } from 'mocha';
import { assert } from 'chai';

import { resolve } from '../../src/api/resolve';
import { Environment } from '../../src/environment/environment';
import { PackageResolver } from '../../src/modules/packages/package-resolver';
import { CF } from '../../src/diagnostics/diagnostic-codes';

import { sourceRepo } from '../fixtures/index';

describe('chef.resolve', () => {
	beforeEach(() => {
		PackageResolver.clearCache();
	});

	it('returns ChefDataResult with found extensions', async () => {
		const r = await resolve({ cwd: sourceRepo, extension: 'ui.buttons' });

		assert.isTrue(r.ok);
		assert.equal(r.command, 'resolve');
		assert.isNumber(r.durationMs);
		assert.lengthOf(r.data!.found, 1);
		assert.equal(r.data!.found[0].name, 'ui.buttons');
		assert.lengthOf(r.data!.notFound, 0);
	});

	it('reports notFound, ok=false, no error', async () => {
		const r = await resolve({ cwd: sourceRepo, extension: 'nope.nope' });

		assert.isFalse(r.ok);
		assert.lengthOf(r.data!.notFound, 1);
		assert.equal(r.data!.notFound[0].code, CF.NOT_FOUND);
		assert.isUndefined(r.error);
	});

	it('returns error for invalid cwd, never throws', async () => {
		const r = await resolve({ cwd: '/definitely/does/not/exist', extension: 'ui.buttons' });

		assert.isFalse(r.ok);
		assert.isDefined(r.error);
		assert.equal(r.error!.code, CF.INVALID_CWD);
	});

	it('returns error when both extension and path given', async () => {
		const r = await resolve({ cwd: sourceRepo, extension: 'ui.buttons', path: '/tmp' });

		assert.isFalse(r.ok);
		assert.equal(r.error!.code, CF.OPTION_DENIED);
	});

	it('does not throw on environment failures', async () => {
		// Should not reject the promise
		const r = await resolve({ cwd: '/nonexistent', extension: 'whatever' });
		Environment.setContext(sourceRepo); // restore
		assert.isFalse(r.ok);
	});
});
