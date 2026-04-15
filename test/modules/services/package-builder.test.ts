import * as path from 'node:path';
import * as fs from 'node:fs';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import sinon from 'sinon';

import { PackageBuilder } from '../../../src/modules/services/package-builder';
import { ChefConfigManager } from '../../../src/modules/config/project/chef-config-manager';
import { Environment } from '../../../src/environment/environment';
import { PackageResolver } from '../../../src/modules/packages/package-resolver';

import { sourceRepo, extensionPath } from '../../fixtures/index';

function cleanBuildArtifacts(dir: string): void
{
	const distPath = path.join(dir, 'dist');
	if (fs.existsSync(distPath))
	{
		fs.rmSync(distPath, { recursive: true });
	}

	// PackageBuilder.build() creates config.php via PhpConfigManager.save()
	const configPhp = path.join(dir, 'config.php');
	if (fs.existsSync(configPhp) && fs.readFileSync(configPhp, 'utf-8').trim() === '')
	{
		fs.rmSync(configPhp);
	}
}

describe('PackageBuilder', () => {
	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		PackageResolver.clearCache();
		sandbox = sinon.createSandbox();
		sandbox.stub(Environment, 'getRoot').returns(sourceRepo);
		sandbox.stub(Environment, 'getType').returns('source');
	});

	afterEach(() => {
		PackageResolver.clearCache();
		sandbox.restore();
	});

	describe('force option', () => {
		const dir = extensionPath('basic-extension');

		beforeEach(() => cleanBuildArtifacts(dir));
		afterEach(() => cleanBuildArtifacts(dir));

		it('should skip validation when force is true', async () => {
			const chefConfigStub = sandbox.stub(ChefConfigManager, 'getInstance').returns({
				getConfig: () => ({
					deny: {
						sourceMaps: true,
					},
				}),
				getEnforce: () => undefined,
			} as any);

			const extension = PackageResolver.resolve('ui.basic-extension');
			assert.isNotNull(extension, 'Extension should be found');

			const result = await new PackageBuilder(extension!).build({ force: true });

			assert.isEmpty(result.errors, 'Build should succeed with force despite deny rules');
			chefConfigStub.restore();
		});

		it('should respect deny rules when force is not set', async () => {
			const chefConfigStub = sandbox.stub(ChefConfigManager, 'getInstance').returns({
				getConfig: () => ({
					deny: {
						sourceMaps: true,
					},
				}),
				getEnforce: () => undefined,
			} as any);

			const extension = PackageResolver.resolve('ui.basic-extension');
			assert.isNotNull(extension, 'Extension should be found');

			const result = await new PackageBuilder(extension!).build();

			assert.isNotEmpty(result.errors, 'Build should fail with deny rules when force is not set');
			assert.include(result.errors[0].message, 'denied', 'Error should mention deny');
			chefConfigStub.restore();
		});
	});
});
