import { ConfigStrategy } from '../../config.strategy';

export const rebuildStrategy = {
	key: 'rebuild',
	getDefault(): string[]
	{
		return [];
	},
	prepare(value: any): string[]
	{
		if (Array.isArray(value))
		{
			return value.filter((item) => typeof item === 'string');
		}

		return this.getDefault();
	},
	validate(value: any): true | string
	{
		if (Array.isArray(value))
		{
			return true;
		}

		return 'Invalid \'rebuild\' value. Expected an array of extension names.';
	},
} satisfies ConfigStrategy<string[]>
