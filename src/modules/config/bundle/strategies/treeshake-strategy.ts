import { ConfigStrategy } from '../../config-strategy';

import type { TreeshakingOptions, TreeshakingPreset } from 'rollup';

type TreeshakeValue = boolean | TreeshakingPreset | TreeshakingOptions;

const PRESETS: TreeshakingPreset[] = ['smallest', 'safest', 'recommended'];

export const treeshakeStrategy = {
	key: 'treeshake',
	getDefault(): boolean
	{
		return true;
	},
	prepare(value: any): TreeshakeValue
	{
		if (typeof value === 'boolean')
		{
			return value;
		}

		if (typeof value === 'string' && PRESETS.includes(value as TreeshakingPreset))
		{
			return value as TreeshakingPreset;
		}

		if (typeof value === 'object' && value !== null && !Array.isArray(value))
		{
			return value as TreeshakingOptions;
		}

		return this.getDefault();
	},
	validate(value: any): true | string
	{
		if (typeof value === 'boolean')
		{
			return true;
		}

		if (typeof value === 'string' && PRESETS.includes(value as TreeshakingPreset))
		{
			return true;
		}

		if (typeof value === 'object' && value !== null && !Array.isArray(value))
		{
			return true;
		}

		return 'Invalid \'treeshake\' value. Expected boolean, preset (\'smallest\' | \'safest\' | \'recommended\'), or TreeshakingOptions object';
	},
} satisfies ConfigStrategy<TreeshakeValue>;
