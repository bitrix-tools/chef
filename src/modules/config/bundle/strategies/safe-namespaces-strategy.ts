import { ConfigStrategy } from '../../config-strategy';

export const safeNamespacesStrategy = {
	key: 'safeNamespaces',
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

		return 'Invalid \'safeNamespaces\' value';
	},
} satisfies ConfigStrategy<boolean>
