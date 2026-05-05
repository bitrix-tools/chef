import * as path from 'node:path';

import { createRequire } from 'node:module';

import { ConfigManager } from '../config-manager';
import * as bundleConfigStrategies from './strategies/index'
import { ConfigStrategy } from '../config-strategy';
import { BundleConfig, LegacyPluginsConfig } from './bundle-config';
import { PreparedBundleConfig } from './prepared-bundle-config';

// tsx/cjs/api is loaded via createRequire so it goes through the CJS resolver
// (which honours exports maps) at *chef's* location — not via ESM resolver
// running from the consumer's package.json. This allows requiring user-land
// `bundle.config.js` / `.ts` regardless of the consumer's `"type": "module"`.
const chefRequire = createRequire(import.meta.url);
const tsxRequire: (id: string, fromFile: string) => any = chefRequire('tsx/cjs/api').require;

export class BundleConfigManager extends ConfigManager<PreparedBundleConfig>
{
	#rawConfig: Record<string, unknown> = {};

	constructor()
	{
		super();

		Object.values(bundleConfigStrategies).forEach((strategy: ConfigStrategy) => {
			this.registerStrategy(strategy.key, strategy);
		});
	}

	getRawConfig(): Record<string, unknown>
	{
		return this.#rawConfig;
	}

	loadFromFile(configPath: string): any
	{
		// tsxRequire goes through tsx's CJS loader, which transparently handles
		// .ts files and ignores the consumer project's `"type": "module"`. This
		// makes bundle.config loading work both from the CLI (preloaded tsx)
		// and from the JS API consumed by an ESM project.
		const absolutePath = path.resolve(configPath);
		const sourceBundleConfig: { default: BundleConfig } & BundleConfig = tsxRequire(absolutePath, absolutePath);

		const config: Record<string, any> = { ...(sourceBundleConfig?.default ?? sourceBundleConfig) };

		this.#rawConfig = { ...config };

		// browserslist → targets (deprecated)
		if ('browserslist' in config && !('targets' in config))
		{
			config.targets = config.browserslist;
		}

		delete config.browserslist;

		// plugins: { resolve, babel, custom } → resolveNodeModules, babel, plugins (deprecated)
		if (config.plugins && !Array.isArray(config.plugins))
		{
			const legacy = config.plugins as LegacyPluginsConfig;

			if (legacy.resolve && !('resolveNodeModules' in config))
			{
				config.resolveNodeModules = true;
			}

			if (legacy.babel === false && !('babel' in config))
			{
				config.babel = false;
			}

			config.plugins = legacy.custom ?? [];
		}

		Object.entries(config).forEach(([key, value]) => {
			this.set(key, value);
		});
	}
}
