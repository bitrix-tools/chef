import path from 'node:path';
import { readFileSync } from 'node:fs';

import type { Plugin } from 'rollup';

interface CssPluginOptions {
	extract: string;
	targets: string[];
	cssImages?: {
		type?: 'inline' | 'copy';
		maxSize?: number;
	};
	packageRoot: string;
}

const mimeTypes: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	webp: 'image/webp',
	avif: 'image/avif',
	ico: 'image/x-icon',
	woff: 'font/woff',
	woff2: 'font/woff2',
	ttf: 'font/ttf',
	eot: 'application/vnd.ms-fontobject',
};

let svgoOptimize: ((svg: string) => string) | null = null;

async function loadSvgo(): Promise<(svg: string) => string>
{
	if (svgoOptimize)
	{
		return svgoOptimize;
	}

	const { optimize } = await import('svgo');

	svgoOptimize = (svg: string): string => {
		const result = optimize(svg, {
			multipass: true,
			plugins: ['preset-default'],
		});

		return result.data;
	};

	return svgoOptimize;
}

function encodeSvgToDataUri(svg: string): string
{
	const encoded = svg
		.replace(/\s+/g, ' ')
		.replace(/"/g, "'")
		.replace(/%/g, '%25')
		.replace(/#/g, '%23')
		.replace(/{/g, '%7B')
		.replace(/}/g, '%7D')
		.replace(/</g, '%3C')
		.replace(/>/g, '%3E');

	return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

function inlineUrl(cssFileDir: string, urlValue: string, maxSizeBytes: number, optimizeSvg: ((svg: string) => string) | null): string | null
{
	if (urlValue.startsWith('data:') || urlValue.startsWith('http'))
	{
		return null;
	}

	const filePath = path.resolve(cssFileDir, urlValue);

	let fileBuffer: Buffer;
	try
	{
		fileBuffer = readFileSync(filePath);
	}
	catch
	{
		return null;
	}

	if (fileBuffer.length >= maxSizeBytes)
	{
		return null;
	}

	const ext = path.extname(filePath).slice(1).toLowerCase();
	const mime = mimeTypes[ext];
	if (!mime)
	{
		return null;
	}

	if (ext === 'svg' && optimizeSvg)
	{
		const optimized = optimizeSvg(fileBuffer.toString('utf-8'));

		return encodeSvgToDataUri(optimized);
	}

	const base64 = fileBuffer.toString('base64');

	return `data:${mime};base64,${base64}`;
}

function inlineUrls(css: string, cssFilePath: string, maxSizeBytes: number, optimizeSvg: ((svg: string) => string) | null): string
{
	const cssFileDir = path.dirname(cssFilePath);

	return css.replace(/url\(\s*(['"]?)(.+?)\1\s*\)/g, (match, _quote, urlValue) => {
		const inlined = inlineUrl(cssFileDir, urlValue, maxSizeBytes, optimizeSvg);
		if (inlined)
		{
			return `url("${inlined}")`;
		}

		return match;
	});
}

async function autoprefix(css: string, targets: string[], filePath: string): Promise<string>
{
	const [
		{ default: postcss },
		{ default: autoprefixer },
	] = await Promise.all([
		import('postcss'),
		import('autoprefixer'),
	]);

	const result = await postcss([
		autoprefixer({ overrideBrowserslist: targets }),
	]).process(css, { from: filePath });

	return result.css;
}

export default function cssPlugin(options: CssPluginOptions): Plugin
{
	const cssModules = new Map<string, string>();

	return {
		name: 'css',

		async transform(code, id)
		{
			if (!id.endsWith('.css'))
			{
				return null;
			}

			const maxSizeBytes = (options.cssImages?.maxSize ?? 14) * 1024;
			const shouldInline = options.cssImages?.type !== 'copy';
			const optimizeSvg = shouldInline ? await loadSvgo() : null;

			let css = code;

			if (shouldInline)
			{
				css = inlineUrls(css, id, maxSizeBytes, optimizeSvg);
			}

			if (options.targets.length > 0)
			{
				css = await autoprefix(css, options.targets, id);
			}

			cssModules.set(id, css);

			return {
				code: 'export default ""',
				map: { mappings: '' },
			};
		},

		generateBundle()
		{
			if (cssModules.size === 0)
			{
				return;
			}

			const visited = new Set<string>();
			const cssOrder: string[] = [];

			const walk = (moduleId: string): void => {
				if (visited.has(moduleId))
				{
					return;
				}

				visited.add(moduleId);

				const moduleInfo = this.getModuleInfo(moduleId);
				if (!moduleInfo)
				{
					return;
				}

				for (const importedId of moduleInfo.importedIds)
				{
					if (cssModules.has(importedId))
					{
						if (!visited.has(importedId))
						{
							cssOrder.push(importedId);
							visited.add(importedId);
						}
					}
					else
					{
						walk(importedId);
					}
				}
			};

			for (const moduleId of this.getModuleIds())
			{
				walk(moduleId);
			}

			const cssChunks = cssOrder
				.map((id) => cssModules.get(id))
				.filter((css): css is string => css !== undefined);

			if (cssChunks.length === 0)
			{
				return;
			}

			const fileName = path.basename(options.extract);

			this.emitFile({
				type: 'asset',
				fileName,
				source: cssChunks.join('\n'),
			});
		},
	};
}
