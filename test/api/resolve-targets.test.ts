import * as path from 'node:path';

import { describe, it, beforeEach } from 'mocha';
import { assert } from 'chai';

import { resolveTargets, validateTargetSelector } from '../../src/api/resolve-targets';
import { Environment } from '../../src/environment/environment';
import { PackageResolver } from '../../src/modules/packages/package-resolver';
import { CF } from '../../src/diagnostics/diagnostic-codes';

import { sourceRepo } from '../fixtures/index';

describe('validateTargetSelector', () => {
	it('returns null for empty selector', () => {
		assert.isNull(validateTargetSelector({}));
	});

	it('returns null with only extension', () => {
		assert.isNull(validateTargetSelector({ extension: 'main.core' }));
	});

	it('returns null with only path', () => {
		assert.isNull(validateTargetSelector({ path: '/some/dir' }));
	});

	it('returns OPTION_DENIED when both extension and path are set', () => {
		const error = validateTargetSelector({ extension: 'main.core', path: '/some/dir' });
		assert.isNotNull(error);
		assert.equal(error!.code, CF.OPTION_DENIED);
		assert.include(error!.message, 'mutually exclusive');
	});
});

describe('resolveTargets', () => {
	beforeEach(() => {
		Environment.setContext(sourceRepo);
		PackageResolver.clearCache();
	});

	it('resolves a single extension by name', async () => {
		const { found, notFound, error } = await resolveTargets({ extension: 'ui.buttons' });

		assert.isUndefined(error);
		assert.lengthOf(notFound, 0);
		assert.lengthOf(found, 1);
		assert.equal(found[0].getName(), 'ui.buttons');
	});

	it('resolves multiple extensions by array', async () => {
		const { found } = await resolveTargets({ extension: ['ui.buttons', 'ui.forms'] });
		const names = found.map((p) => p.getName()).sort();

		assert.deepEqual(names, ['ui.buttons', 'ui.forms']);
	});

	it('resolves a glob pattern', async () => {
		const { found } = await resolveTargets({ extension: 'ui.circular-*' });
		const names = found.map((p) => p.getName()).sort();

		assert.includeMembers(names, ['ui.circular-a', 'ui.circular-imports']);
	});

	it('reports notFound for non-existent extension', async () => {
		const { found, notFound } = await resolveTargets({ extension: 'definitely.nonexistent' });

		assert.lengthOf(found, 0);
		assert.lengthOf(notFound, 1);
		assert.equal(notFound[0].name, 'definitely.nonexistent');
		assert.equal(notFound[0].code, CF.NOT_FOUND);
	});

	it('separates found and notFound when given a mix', async () => {
		const { found, notFound } = await resolveTargets({
			extension: ['ui.buttons', 'definitely.nonexistent'],
		});

		assert.lengthOf(found, 1);
		assert.lengthOf(notFound, 1);
		assert.equal(found[0].getName(), 'ui.buttons');
		assert.equal(notFound[0].name, 'definitely.nonexistent');
	});

	it('scans a directory for path option', async () => {
		const buttonsDir = path.join(sourceRepo, 'ui/install/js/ui/buttons');
		const { found } = await resolveTargets({ path: buttonsDir });

		assert.lengthOf(found, 1);
		assert.equal(found[0].getName(), 'ui.buttons');
	});

	it('scans entire project when neither extension nor path is given', async () => {
		const { found } = await resolveTargets({});

		// fixture has many extensions; just check we got more than a couple
		assert.isAbove(found.length, 5);
	});

	it('returns error when both extension and path are given', async () => {
		const result = await resolveTargets({ extension: 'ui.buttons', path: '/some/dir' });

		assert.isDefined(result.error);
		assert.equal(result.error!.code, CF.OPTION_DENIED);
		assert.lengthOf(result.found, 0);
		assert.lengthOf(result.notFound, 0);
	});
});
