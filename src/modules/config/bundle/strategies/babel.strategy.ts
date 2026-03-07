import { ConfigStrategy } from '../../config.strategy';

export const babelStrategy = {
	key: 'babel',
	getDefault(): boolean
	{
		return true;
	},
	prepare(value: any): boolean
	{
		if (value === false)
		{
			return false;
		}

		return true;
	},
	validate(value: any): true | string
	{
		if (typeof value === 'boolean' || value === undefined)
		{
			return true;
		}

		return 'Invalid \'babel\' value';
	},
} satisfies ConfigStrategy<boolean>
