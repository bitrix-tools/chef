import { ConfigStrategy } from '../../config-strategy';

import type { MinifyOptions } from 'terser';

export const minificationStrategy = {
	key: 'minification',
	getDefault(): boolean | MinifyOptions
	{
		return false;
	},
	prepare(value: any): boolean | MinifyOptions
	{
		if (value && typeof value === 'object')
		{
			return value;
		}

		return Boolean(value);
	},
	validate(value: any): true | string
	{
		return true;
	},
} satisfies ConfigStrategy<boolean | MinifyOptions>
