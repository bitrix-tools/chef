import { ConfigStrategy } from '../../config-strategy';

export const namespaceStrategy = {
	key: 'namespace',
	getDefault(): string | undefined
	{
		return undefined;
	},
	prepare(value: any): string
	{
		return String(value);
	},
	validate(value: any): true | string
	{
		if (typeof value === 'string')
		{
			return true;
		}

		return 'Invalid \'namespace\' value.';
	},
} satisfies ConfigStrategy<string | undefined>
