import { ConfigStrategy } from '../../config.strategy';


export const targetsStrategy = {
	key: 'targets',
	getDefault(): undefined
	{
		return undefined;
	},
	prepare(value: any): string | Array<string> | undefined
	{
		if (typeof value === 'string' || Array.isArray(value))
		{
			return value;
		}

		return undefined;
	},
	validate(value: any): true | string
	{
		if (value === undefined || typeof value === 'string' || Array.isArray(value))
		{
			return true;
		}

		return 'Invalid \'targets\' value. Expected a string or array of strings.';
	},
} satisfies ConfigStrategy<string | Array<string> | undefined>
