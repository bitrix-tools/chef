import { ConfigStrategy } from '../../config-strategy';

export interface NpmRemap {
	npm: string;
	from: string;
}

export type RemapTarget = string | NpmRemap;

export interface StandaloneConfig {
	enabled: boolean;
	remap: Record<string, RemapTarget>;
	exposeNamespaces: boolean;
}

function validateRemapEntry(key: string, value: unknown): true | string
{
	if (typeof value === 'string')
	{
		return true;
	}

	if (typeof value === 'object' && value !== null)
	{
		if (typeof (value as any).npm !== 'string')
		{
			return `Invalid remap entry '${key}': 'npm' must be a string`;
		}

		if (typeof (value as any).from !== 'string')
		{
			return `Invalid remap entry '${key}': 'from' must be a string`;
		}

		return true;
	}

	return `Invalid remap entry '${key}': expected a string or { npm, from } object`;
}

export const standaloneStrategy = {
	key: 'standalone',
	getDefault(): StandaloneConfig
	{
		return { enabled: false, remap: {}, exposeNamespaces: false };
	},
	prepare(value: any): StandaloneConfig
	{
		if (value === true)
		{
			return { enabled: true, remap: {}, exposeNamespaces: false };
		}

		if (typeof value === 'object' && value !== null)
		{
			return {
				enabled: true,
				remap: value.remap ?? {},
				exposeNamespaces: value.exposeNamespaces === true,
			};
		}

		return { enabled: false, remap: {}, exposeNamespaces: false };
	},
	validate(value: any): true | string
	{
		if (typeof value === 'boolean')
		{
			return true;
		}

		if (typeof value === 'object' && value !== null)
		{
			if (value.remap !== undefined)
			{
				if (typeof value.remap !== 'object' || value.remap === null)
				{
					return 'Invalid \'standalone.remap\' value: expected an object';
				}

				for (const [key, entry] of Object.entries(value.remap))
				{
					const result = validateRemapEntry(key, entry);
					if (result !== true)
					{
						return result;
					}
				}
			}

			if (value.exposeNamespaces !== undefined && typeof value.exposeNamespaces !== 'boolean')
			{
				return 'Invalid \'standalone.exposeNamespaces\' value: expected a boolean';
			}

			return true;
		}

		return 'Invalid \'standalone\' value';
	},
} satisfies ConfigStrategy<StandaloneConfig>