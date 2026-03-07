import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'rolldown';

export interface PostcssPluginOptions {
	extensions?: string[];
	extract?: string | boolean;
	to?: string;
	sourceMap?: boolean;
	plugins?: any[];
}

export default function postcssPlugin(options: PostcssPluginOptions = {}): Plugin
{
	const {
		extensions = ['.css'],
		extract = true,
		to,
		sourceMap = false,
		plugins = [],
	} = options;

	const cssMap = new Map<string, string>();
	const extensionPattern = new RegExp(`(${extensions.map(e => e.replace('.', '\\.')).join('|')})$`);

	let postcssProcessor: any;

	return {
		name: 'rolldown-postcss',

		buildStart()
		{
			cssMap.clear();
		},

		resolveId: {
			filter: { id: extensionPattern },
			async handler(source, importer)
			{
				const resolved = await this.resolve(source, importer, { skipSelf: true });
				if (resolved)
				{
					return { id: resolved.id + '?css-extracted', external: false };
				}

				return null;
			},
		},

		load: {
			filter: { id: /\?css-extracted$/ },
			async handler(id)
			{
				const realPath = id.replace('?css-extracted', '');
				const css = readFileSync(realPath, 'utf8');

				if (!postcssProcessor)
				{
					const postcss = (await import('postcss')).default;
					postcssProcessor = postcss(plugins);
				}

				const result = await postcssProcessor.process(css, {
					from: realPath,
					to: to || undefined,
					map: sourceMap ? { inline: false } : false,
				});

				cssMap.set(realPath, result.css);

				return { code: '/* css extracted */', moduleType: 'js' };
			},
		},

		generateBundle()
		{
			if (cssMap.size === 0)
			{
				return;
			}

			const css = [...cssMap.values()].join('\n');
			const fileName = typeof extract === 'string'
				? path.basename(extract)
				: 'style.css';

			this.emitFile({
				type: 'asset',
				fileName,
				source: css,
			});
		},
	};
}
