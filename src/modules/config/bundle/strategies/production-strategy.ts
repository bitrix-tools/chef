import { ConfigStrategy } from '../../config-strategy';

export const productionStrategy = {
	key: 'production',
	getDefault(): boolean
	{
		return false;
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

		return 'Invalid \'production\' value';
	},
} satisfies ConfigStrategy<boolean>
