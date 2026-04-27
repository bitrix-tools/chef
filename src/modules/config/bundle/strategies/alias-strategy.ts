import { ConfigStrategy } from '../../config-strategy';

/**
 * Controls whether the extension is added to `aliases.tsconfig.json` paths.
 *
 * Default: `true` — `chef aliases` includes the extension as
 * `paths['<ext>']` so that `import { ... } from '<ext>'` resolves to
 * the extension's source/typings.
 *
 * Set to `false` for extensions that publish their own ambient declarations
 * via `declare module '<ext>' { ... }` — then a paths mapping would conflict
 * with the ambient declaration (TS treats the file as both primary module
 * and self-augmentation, leading to TS2667 / TS2666 errors).
 */
export const aliasStrategy = {
	key: 'alias',
	getDefault(): boolean
	{
		return true;
	},
	prepare(value: any): boolean
	{
		return value !== false;
	},
	validate(value: any): true | string
	{
		if (typeof value === 'boolean' || value === undefined)
		{
			return true;
		}

		return 'Invalid \'alias\' value: expected a boolean';
	},
} satisfies ConfigStrategy<boolean>
