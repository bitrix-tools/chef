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

interface AssetToCopy {
	filePath: string;
	fileName: string;
	source: Buffer;
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

interface InlineResult {
	type: 'inlined';
	dataUri: string;
}

interface CopyResult {
	type: 'copy';
	asset: AssetToCopy;
	suffix: string;
}

function splitUrlSuffix(urlValue: string): { filePath: string; suffix: string }
{
	const hashIndex = urlValue.indexOf('#');
	const queryIndex = urlValue.indexOf('?');

	let splitIndex = -1;
	if (hashIndex !== -1 && queryIndex !== -1)
	{
		splitIndex = Math.min(hashIndex, queryIndex);
	}
	else if (hashIndex !== -1)
	{
		splitIndex = hashIndex;
	}
	else if (queryIndex !== -1)
	{
		splitIndex = queryIndex;
	}

	if (splitIndex === -1)
	{
		return { filePath: urlValue, suffix: '' };
	}

	return {
		filePath: urlValue.slice(0, splitIndex),
		suffix: urlValue.slice(splitIndex),
	};
}

function processUrl(
	cssFileDir: string,
	urlValue: string,
	maxSizeBytes: number,
	optimizeSvg: ((svg: string) => string) | null,
	packageRoot: string,
): InlineResult | CopyResult | null
{
	if (urlValue.startsWith('data:') || urlValue.startsWith('http'))
	{
		return null;
	}

	const { filePath: relativeFilePath, suffix } = splitUrlSuffix(urlValue);
	const filePath = path.resolve(cssFileDir, relativeFilePath);

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
		let relativeToPkg = path.relative(packageRoot, filePath);
		if (relativeToPkg.startsWith(`src${path.sep}`))
		{
			relativeToPkg = relativeToPkg.slice(4);
		}

		const fileName = relativeToPkg.startsWith(`images${path.sep}`)
			? relativeToPkg
			: path.join('images', relativeToPkg);

		return {
			type: 'copy',
			asset: { filePath, fileName, source: fileBuffer },
			suffix,
		};
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

		return { type: 'inlined', dataUri: encodeSvgToDataUri(optimized) };
	}

	const base64 = fileBuffer.toString('base64');

	return { type: 'inlined', dataUri: `data:${mime};base64,${base64}` };
}

function processUrls(
	css: string,
	cssFilePath: string,
	maxSizeBytes: number,
	optimizeSvg: ((svg: string) => string) | null,
	packageRoot: string,
	outputCssPath: string,
): { css: string; assets: AssetToCopy[] }
{
	const cssFileDir = path.dirname(cssFilePath);
	const outputCssDir = path.dirname(outputCssPath);
	const assets: AssetToCopy[] = [];

	const processed = css.replace(/url\(\s*(['"]?)(.+?)\1\s*\)/g, (match, _quote, urlValue) => {
		const result = processUrl(cssFileDir, urlValue, maxSizeBytes, optimizeSvg, packageRoot);
		if (!result)
		{
			return match;
		}

		if (result.type === 'inlined')
		{
			return `url("${result.dataUri}")`;
		}

		assets.push(result.asset);

		// Rewrite url() to point to the copied file relative to output CSS
		const assetOutputPath = path.join(path.dirname(outputCssPath), result.asset.fileName);
		const relativeUrl = path.relative(outputCssDir, assetOutputPath).replaceAll('\\', '/');

		return `url("${relativeUrl}${result.suffix}")`;
	});

	return { css: processed, assets };
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
	const assetsToCopy = new Map<string, AssetToCopy>();

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
				const result = processUrls(css, id, maxSizeBytes, optimizeSvg, options.packageRoot, options.extract);
				css = result.css;

				for (const asset of result.assets)
				{
					assetsToCopy.set(asset.filePath, asset);
				}
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

				if (cssModules.has(moduleId))
				{
					cssOrder.push(moduleId);

					return;
				}

				const moduleInfo = this.getModuleInfo(moduleId);
				if (!moduleInfo)
				{
					return;
				}

				// Own CSS first, then recurse into JS dependencies
				const cssImports: string[] = [];
				const jsImports: string[] = [];

				for (const importedId of moduleInfo.importedIds)
				{
					if (cssModules.has(importedId))
					{
						cssImports.push(importedId);
					}
					else
					{
						jsImports.push(importedId);
					}
				}

				for (const id of cssImports)
				{
					walk(id);
				}

				for (const id of jsImports)
				{
					walk(id);
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

			for (const asset of assetsToCopy.values())
			{
				this.emitFile({
					type: 'asset',
					fileName: asset.fileName,
					source: asset.source,
				});
			}
		},
	};
}
