import type { Plugin } from 'rollup';
import { ConfigStrategy } from '../../config.strategy';


export const pluginsStrategy = {
	key: 'plugins',
	getDefault(): Plugin[]
	{
		return [];
	},
	prepare(value: any): Plugin[]
	{
		if (Array.isArray(value))
		{
			return value;
		}

		return this.getDefault();
	},
	validate(value: any): true | string
	{
		if (Array.isArray(value) || value === undefined)
		{
			return true;
		}

		return 'Invalid \'plugins\' value. Expected an array of Rollup plugins.';
	},
} satisfies ConfigStrategy<Plugin[]>
