import { describe, it, beforeEach } from 'mocha';
import { assert } from 'chai';

import { lint } from '../../src/api/lint';
import { PackageResolver } from '../../src/modules/packages/package-resolver';
import { CF } from '../../src/diagnostics/diagnostic-codes';

import { sourceRepo } from '../fixtures/index';

describe('chef.lint', () => {
	beforeEach(() => {
		PackageResolver.clearCache();
	});

	it('returns ChefResult with required fields', async () => {
		const r = await lint({ cwd: sourceRepo, extension: 'definitely.nope' });

		assert.equal(r.command, 'lint');
		assert.hasAllKeys(r, ['ok', 'command', 'extensions', 'notFound', 'summary']);
		assert.containsAllKeys(r.summary, ['total', 'passed', 'failed', 'durationMs', 'errorCount', 'warningCount']);
	});

	it('reports notFound, no fatal error', async () => {
		const r = await lint({ cwd: sourceRepo, extension: 'definitely.nope' });

		assert.isFalse(r.ok);
		assert.lengthOf(r.notFound, 1);
		assert.isUndefined(r.error);
	});

	it('returns fatal error for invalid cwd', async () => {
		const r = await lint({ cwd: '/nope', extension: 'whatever' });

		assert.isFalse(r.ok);
		assert.equal(r.error!.code, CF.INVALID_CWD);
	});

	it('returns OPTION_DENIED when both extension and path', async () => {
		const r = await lint({ cwd: sourceRepo, extension: 'ui.buttons', path: '/tmp' });

		assert.isFalse(r.ok);
		assert.equal(r.error!.code, CF.OPTION_DENIED);
	});

	it('does not throw', async () => {
		await lint({ cwd: '/nope' });
		await lint({ cwd: sourceRepo, extension: 'x.y' });
		await lint({ cwd: sourceRepo, extension: 'a', path: 'b' });
	});
});
