import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'module';
import { Environment } from '../../../environment/environment';
import type { ChefConfig } from './chef.config';

export class ChefConfigManager
{
	static #instance: ChefConfigManager | null = null;
	static #loaded = false;

	#config: ChefConfig = {};

	static getInstance(): ChefConfigManager
	{
		if (!this.#instance)
		{
			this.#instance = new ChefConfigManager();
		}

		if (!this.#loaded)
		{
			this.#loaded = true;
			this.#instance.#load();
		}

		return this.#instance;
	}

	#load(): void
	{
		const root = Environment.getRoot();
		if (!root)
		{
			return;
		}

		const configNames = ['chef.config.ts', 'chef.config.js'];

		for (const name of configNames)
		{
			const configPath = path.resolve(root, name);
			if (fs.existsSync(configPath))
			{
				const require = createRequire(import.meta.url);
				const loaded = require(configPath);
				this.#config = loaded?.default ?? loaded;

				return;
			}
		}
	}

	getConfig(): ChefConfig
	{
		return this.#config;
	}

	getDeny(): ChefConfig['deny']
	{
		return this.#config.deny;
	}

	getDefaults(): ChefConfig['defaults']
	{
		return this.#config.defaults;
	}

	getEnforce(): ChefConfig['enforce']
	{
		return this.#config.enforce;
	}
}
