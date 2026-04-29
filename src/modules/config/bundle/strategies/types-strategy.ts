import { ConfigStrategy } from '../../config-strategy';

/**
 * Path (relative to the extension directory) of a TypeScript declaration file
 * that publishes the extension's design-time type surface.
 *
 * When set, `chef aliases` writes this path into `aliases.tsconfig.json` paths
 * instead of `input`, and `webpack.config.js` resolves the IDE alias to it.
 * Useful for vendor-bundled extensions whose `input` is a JS file (so the
 * runtime build still works) but which want PhpStorm/WebStorm to pick up rich
 * types from a sibling `.d.ts` file.
 *
 * Default: `null` — fall back to `input`.
 */
export const typesStrategy = {
	key: 'types',
	getDefault(): string | null
	{
		return null;
	},
	prepare(value: any): string | null
	{
		if (value === undefined || value === null)
		{
			return null;
		}

		return String(value);
	},
	validate(value: any): true | string
	{
		if (value === undefined || value === null || typeof value === 'string')
		{
			return true;
		}

		return 'Invalid \'types\' value: expected a string path or undefined';
	},
} satisfies ConfigStrategy<string | null>
