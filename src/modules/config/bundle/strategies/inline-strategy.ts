import { ConfigStrategy } from '../../config-strategy';

export const inlineStrategy = {
	key: 'inline',
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
		if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
		{
			return true;
		}

		return 'Invalid \'inline\' value. Expected an array of extension names or glob patterns.';
	},
} satisfies ConfigStrategy<string[]>
