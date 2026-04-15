import { ConfigStrategy } from '../../config-strategy';

const prepareValue = (value: string): { js: string, css: string } => {
	const jsBundle = value;
	const cssBundle = value.replace(/\.js$/, '.css');

	return {
		js: jsBundle,
		css: cssBundle,
	};
};

export const outputStrategy = {
	key: 'output',
	getDefault(): { js: string, css: string }
	{
		return {
			js: 'bundle.js',
			css: 'bundle.css',
		};
	},
	prepare(value: any): { js: string, css: string }
	{
		if (typeof value === 'string')
		{
			return prepareValue(value)
		}

		if (value.js && !value.css)
		{
			return prepareValue(value.js);
		}

		if (!value.js && value.css)
		{
			const cssBasename = value.css.replace(/\.css$/, '');

			return { js: `${cssBasename}.js`, css: value.css };
		}

		if (value.js && value.css)
		{
			return value;
		}
	},
	validate(value: any): true | string
	{
		if (typeof value === 'string' || value.js || value.css)
		{
			return true;
		}

		return 'Invalid \'output\' value';
	},
} satisfies ConfigStrategy<{ js: string, css: string }>
