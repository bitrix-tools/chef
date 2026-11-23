import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';
import browserslist from 'browserslist';

import { resolveTargets } from '../../../src/modules/packages/resolve-targets';
import { ChefConfigManager } from '../../../src/modules/config/project/chef-config-manager';
import { Environment } from '../../../src/environment/environment';

import type { ChefConfig } from '../../../src/modules/config/project/chef-config';

describe('resolveTargets', () => {
	let sandbox: sinon.SinonSandbox;
	let root: string;
	let packagePath: string;
	let savedEnvironment: Record<string, string | undefined>;

	function useChefConfig(config: ChefConfig): void
	{
		sandbox.stub(ChefConfigManager, 'getInstance').returns({
			getConfig: () => config,
		} as any);
	}

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-targets-')));
		packagePath = path.join(root, 'ui', 'install', 'js', 'ui', 'button');
		fs.mkdirSync(packagePath, { recursive: true });

		sandbox.stub(Environment, 'getRoot').returns(root);

		savedEnvironment = {
			BROWSERSLIST: process.env.BROWSERSLIST,
			BROWSERSLIST_CONFIG: process.env.BROWSERSLIST_CONFIG,
		};
		delete process.env.BROWSERSLIST;
		delete process.env.BROWSERSLIST_CONFIG;

		browserslist.clearCaches();
	});

	afterEach(() => {
		sandbox.restore();
		fs.rmSync(root, { recursive: true, force: true });

		for (const [name, value] of Object.entries(savedEnvironment))
		{
			if (value === undefined)
			{
				delete process.env[name];
			}
			else
			{
				process.env[name] = value;
			}
		}

		browserslist.clearCaches();
	});

	describe('without deny.targets', () => {
		it('should prefer targets from bundle.config', () => {
			useChefConfig({});
			fs.writeFileSync(path.join(packagePath, '.browserslistrc'), 'firefox 115');

			const result = resolveTargets({ packagePath, bundleTargets: 'chrome 100' });

			assert.deepEqual(result.targets, ['chrome 100']);
			assert.isEmpty(result.deniedOverrides);
		});

		it('should use the nearest browserslist config', () => {
			useChefConfig({});
			fs.writeFileSync(path.join(root, '.browserslistrc'), 'chrome 109');
			fs.writeFileSync(path.join(packagePath, '.browserslistrc'), 'firefox 115');

			assert.deepEqual(resolveTargets({ packagePath }).targets, ['firefox 115']);
		});

		it('should fall back to defaults.targets', () => {
			useChefConfig({ defaults: { targets: 'safari 16.4' } });

			assert.deepEqual(resolveTargets({ packagePath }).targets, ['safari 16.4']);
		});

		it('should resolve enforce.targets over own targets', () => {
			useChefConfig({ enforce: { targets: ['chrome 110', 'firefox 120'] } });
			fs.writeFileSync(path.join(packagePath, '.browserslistrc'), 'firefox 115');

			const result = resolveTargets({ packagePath, bundleTargets: 'chrome 100' });

			assert.deepEqual(result.targets, ['chrome 110', 'firefox 120']);
		});
	});

	describe('with deny.targets', () => {
		it('should ignore own targets and use the project config', () => {
			useChefConfig({ deny: { targets: true } });
			fs.writeFileSync(path.join(root, '.browserslistrc'), 'chrome 109');
			fs.writeFileSync(path.join(packagePath, '.browserslistrc'), 'firefox 115');

			const result = resolveTargets({ packagePath, bundleTargets: 'chrome 100' });

			assert.deepEqual(result.targets, ['chrome 109']);
			assert.deepEqual(result.deniedOverrides, [
				'targets in bundle.config',
				path.join('ui', 'install', 'js', 'ui', 'button', '.browserslistrc'),
			]);
		});

		it('should report a browserslist config between the extension and the project root', () => {
			useChefConfig({ deny: { targets: true } });
			fs.writeFileSync(
				path.join(root, 'ui', 'package.json'),
				JSON.stringify({ browserslist: ['firefox 115'] }),
			);

			const result = resolveTargets({ packagePath });

			assert.deepEqual(result.deniedOverrides, [path.join('ui', 'package.json')]);
			assert.deepEqual(result.targets, browserslist('baseline widely available'));
		});

		it('should not report the project root config', () => {
			useChefConfig({ deny: { targets: true } });
			fs.writeFileSync(path.join(root, '.browserslistrc'), 'chrome 109');

			const result = resolveTargets({ packagePath, bundleTargets: undefined });

			assert.deepEqual(result.targets, ['chrome 109']);
			assert.isEmpty(result.deniedOverrides);
		});

		it('should ignore browserslist environment variables', () => {
			useChefConfig({ deny: { targets: true } });
			fs.writeFileSync(path.join(root, '.browserslistrc'), 'chrome 109');
			process.env.BROWSERSLIST = 'firefox 115';

			const result = resolveTargets({ packagePath });

			assert.deepEqual(result.targets, ['chrome 109']);
			assert.deepEqual(result.deniedOverrides, ['BROWSERSLIST environment variable']);
		});

		it('should use defaults.targets when the project has no browserslist config', () => {
			useChefConfig({ deny: { targets: true }, defaults: { targets: 'safari 16.4' } });

			const result = resolveTargets({ packagePath, bundleTargets: ['chrome 100'] });

			assert.deepEqual(result.targets, ['safari 16.4']);
			assert.deepEqual(result.deniedOverrides, ['targets in bundle.config']);
		});

		it('should keep enforce.targets on top', () => {
			useChefConfig({ deny: { targets: true }, enforce: { targets: 'chrome 120' } });
			fs.writeFileSync(path.join(root, '.browserslistrc'), 'chrome 109');

			assert.deepEqual(resolveTargets({ packagePath }).targets, ['chrome 120']);
		});
	});
});
