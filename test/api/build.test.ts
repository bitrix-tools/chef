import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { build } from '../../src/api/build';
import { PackageResolver } from '../../src/modules/packages/package-resolver';
import { CF } from '../../src/diagnostics/diagnostic-codes';

import { sourceRepo } from '../fixtures/index';

function createTmpSourceRepo(): string
{
	const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-api-build-')));
	fs.cpSync(sourceRepo, tmp, { recursive: true });
	return tmp;
}

describe('chef.build', () => {
	beforeEach(() => {
		PackageResolver.clearCache();
	});

	describe('result shape', () => {
		it('returns ChefResult with all required fields', async () => {
			const r = await build({ cwd: sourceRepo, extension: 'definitely.nope' });

			assert.hasAllKeys(r, ['ok', 'command', 'extensions', 'notFound', 'summary']);
			assert.equal(r.command, 'build');
			assert.isArray(r.extensions);
			assert.isArray(r.notFound);
			assert.containsAllKeys(r.summary, ['total', 'passed', 'failed', 'durationMs']);
		});

		it('reports notFound separately from error', async () => {
			const r = await build({ cwd: sourceRepo, extension: 'definitely.nope' });

			assert.isFalse(r.ok);
			assert.lengthOf(r.notFound, 1);
			assert.equal(r.notFound[0].code, CF.NOT_FOUND);
			assert.isUndefined(r.error);
			assert.lengthOf(r.extensions, 0);
		});

		it('returns fatal error in result.error for invalid cwd', async () => {
			const r = await build({ cwd: '/definitely/nonexistent', extension: 'whatever' });

			assert.isFalse(r.ok);
			assert.isDefined(r.error);
			assert.equal(r.error!.code, CF.INVALID_CWD);
			assert.lengthOf(r.extensions, 0);
		});

		it('returns OPTION_DENIED when both extension and path given', async () => {
			const r = await build({ cwd: sourceRepo, extension: 'ui.buttons', path: '/tmp' });

			assert.isFalse(r.ok);
			assert.equal(r.error!.code, CF.OPTION_DENIED);
		});

		it('does not throw on any failure path', async () => {
			// Several failure modes — none should reject
			const a = await build({ cwd: '/nope' });
			const b = await build({ cwd: sourceRepo, extension: 'a.b.c.d' });
			const c = await build({ cwd: sourceRepo, extension: 'x', path: '/y' });

			assert.isFalse(a.ok);
			assert.isFalse(b.ok);
			assert.isFalse(c.ok);
		});

		it('summary.durationMs is a number', async () => {
			const r = await build({ cwd: sourceRepo, extension: 'definitely.nope' });
			assert.isNumber(r.summary.durationMs);
			assert.isAtLeast(r.summary.durationMs, 0);
		});
	});

	describe('actual build', () => {
		let tmpRepo: string;

		beforeEach(() => {
			tmpRepo = createTmpSourceRepo();
		});

		afterEach(() => {
			fs.rmSync(tmpRepo, { recursive: true, force: true });
		});

		it('builds an extension and fills BuildDetails', async () => {
			const r = await build({ cwd: tmpRepo, extension: 'ui.ts-valid' });

			assert.isTrue(r.ok, `build failed: ${JSON.stringify(r, null, 2)}`);
			assert.equal(r.summary.total, 1);
			assert.equal(r.summary.passed, 1);
			assert.equal(r.summary.failed, 0);
			assert.isAbove(r.summary.bundlesSize, 0);
			assert.isNumber(r.summary.warningCount);

			const ext = r.extensions[0];
			assert.equal(ext.name, 'ui.ts-valid');
			assert.isTrue(ext.ok);
			assert.isDefined(ext.details);
			assert.isArray(ext.details!.bundles);
			assert.isAbove(ext.details!.bundles.length, 0);
		});

		it('fills extensions[].error on build failure', async () => {
			const r = await build({ cwd: tmpRepo, extension: 'ui.syntax-error' });

			assert.isFalse(r.ok);
			assert.equal(r.summary.failed, 1);
			const ext = r.extensions[0];
			assert.isFalse(ext.ok);
			assert.isDefined(ext.error);
			assert.isString(ext.error!.code);
			assert.isString(ext.error!.message);
		});
	});
});
