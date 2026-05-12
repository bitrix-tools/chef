import path from 'node:path';
import fs from 'node:fs';

import { createRequire } from 'node:module';

import { Environment } from '../../../environment/environment';

import type { ChefConfig } from './chef-config';

// Mirrors BundleConfigManager: route .ts/.js through tsx's CJS loader so user
// projects with `"type": "module"` can still expose a chef.config.ts file
// without ESM resolution from their package.json.
const chefRequire = createRequire(import.meta.url);
const tsxRequire: (id: string, fromFile: string) => any = chefRequire('tsx/cjs/api').require;

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
				const loaded = tsxRequire(configPath, configPath);
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
