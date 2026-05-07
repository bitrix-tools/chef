import { describe, it, beforeEach } from 'mocha';
import { assert } from 'chai';

import { lint } from '../../../src/reporters/json/lint';
import { PackageResolver } from '../../../src/modules/packages/package-resolver';
import { CF } from '../../../src/diagnostics/diagnostic-codes';

import { sourceRepo } from '../../fixtures/index';

describe('chef.lint', () => {
	beforeEach(() => {
		PackageResolver.clearCache();
	});

	it('returns ChefResult with required fields', async () => {
		const r = await lint({ cwd: sourceRepo, extension: 'definitely.nope' });

		assert.equal(r.command, 'lint');
		assert.containsAllKeys(r, ['success', 'command', 'extensions', 'summary']);
		assert.containsAllKeys(r.summary, ['total', 'passed', 'failed', 'durationMs', 'errorCount', 'warningCount', 'fixedCount']);
	});

	it('returns empty extensions when nothing matches', async () => {
		const r = await lint({ cwd: sourceRepo, extension: 'definitely.nope' });

		assert.isTrue(r.success);
		assert.lengthOf(r.extensions, 0);
	});

	it('returns fatal error for invalid cwd', async () => {
		const r = await lint({ cwd: '/nope', extension: 'whatever' });

		assert.isFalse(r.success);
		assert.equal(r.error!.code, CF.INVALID_CWD);
	});

	it('returns OPTION_DENIED when both extension and path', async () => {
		const r = await lint({ cwd: sourceRepo, extension: 'ui.buttons', path: '/tmp' });

		assert.isFalse(r.success);
		assert.equal(r.error!.code, CF.OPTION_DENIED);
	});

	it('does not throw', async () => {
		await lint({ cwd: '/nope' });
		await lint({ cwd: sourceRepo, extension: 'x.y' });
		await lint({ cwd: sourceRepo, extension: 'a', path: 'b' });
	});
});
