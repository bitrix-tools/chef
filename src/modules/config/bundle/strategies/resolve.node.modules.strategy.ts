import { ConfigStrategy } from '../../config.strategy';

export const resolveNodeModulesStrategy = {
	key: 'resolveNodeModules',
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

		return 'Invalid \'resolveNodeModules\' value';
	},
} satisfies ConfigStrategy<boolean>
