import { ConfigManager } from '../config.manager';
import * as bundleConfigStrategies from './strategies/index'
import * as path from 'node:path';
import { ConfigStrategy } from '../config.strategy';
import { BundleConfig } from './bundle.config';
import { PreparedBundleConfig } from './prepared.bundle.config';
import { createRequire } from 'module';

export class BundleConfigManager extends ConfigManager<PreparedBundleConfig>
{
	constructor()
	{
		super();

		Object.values(bundleConfigStrategies).forEach((strategy: ConfigStrategy) => {
			this.registerStrategy(strategy.key, strategy);
		});
	}

	loadFromFile(configPath: string): any
	{
		const require = createRequire(import.meta.url);
		const sourceBundleConfig: { default: BundleConfig } & BundleConfig = require(path.resolve(configPath));

		const config = sourceBundleConfig?.default ?? sourceBundleConfig;

		// browserslist → targets (deprecated)
		if ('browserslist' in config && !('targets' in config))
		{
			config.targets = config.browserslist;
		}

		Object.entries(config).forEach(([key, value]) => {
			if (key === 'browserslist')
			{
				return;
			}

			this.set(key, value);
		});
	}
}
