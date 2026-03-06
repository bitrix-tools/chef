import { ConfigStrategy } from '../../config.strategy';

export const standaloneStrategy = {
	key: 'standalone',
	getDefault(): any
	{
		return false;
	},
	prepare(value: any): boolean
	{
		return value === true;
	},
	validate(value: any): true | string
	{
		if (typeof value === 'boolean')
		{
			return true;
		}

		return 'Invalid \'standalone\' value';
	},
} satisfies ConfigStrategy<boolean>