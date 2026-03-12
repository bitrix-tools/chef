import { ConfigStrategy } from '../../config-strategy';

export const emitDeclarationStrategy = {
	key: 'emitDeclaration',
	getDefault(): any
	{
		return true;
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

		return 'Invalid \'emitDeclaration\' value';
	},
} satisfies ConfigStrategy<boolean>
