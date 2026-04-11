import { ConfigStrategy } from '../../config-strategy';

export type TransformClassesValue = boolean | string[];

function isStringArray(value: any): value is string[]
{
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export const transformClassesStrategy = {
	key: 'transformClasses',
	getDefault(): any
	{
		return false;
	},
	prepare(value: any): TransformClassesValue
	{
		if (typeof value === 'boolean')
		{
			return value;
		}

		if (isStringArray(value))
		{
			return value;
		}

		return this.getDefault();
	},
	validate(value: any): true | string
	{
		if (typeof value === 'boolean')
		{
			return true;
		}

		if (isStringArray(value))
		{
			return true;
		}

		return 'Invalid \'transformClasses\' value. Expected boolean or array of class names.';
	},
} satisfies ConfigStrategy<TransformClassesValue>
