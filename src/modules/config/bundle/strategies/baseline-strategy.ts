import { ConfigStrategy } from '../../config-strategy';

export const baselineStrategy = {
	key: 'baseline',
	getDefault(): boolean
	{
		return true;
	},
	prepare(value: any): boolean
	{
		return value === true;
	},
	validate(value: any): true | string
	{
		if (typeof value === 'boolean' || value === undefined)
		{
			return true;
		}

		return 'Invalid \'baseline\' value';
	},
} satisfies ConfigStrategy<boolean>
