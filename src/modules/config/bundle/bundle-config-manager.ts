import * as path from 'node:path';

import { createRequire } from 'module';

import { ConfigManager } from '../config-manager';
import * as bundleConfigStrategies from './strategies/index'
import { ConfigStrategy } from '../config-strategy';
import { BundleConfig, LegacyPluginsConfig } from './bundle-config';
import { PreparedBundleConfig } from './prepared-bundle-config';

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
		const require = createRequire(import.meta.url);
		const sourceBundleConfig: { default: BundleConfig } & BundleConfig = require(path.resolve(configPath));

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
