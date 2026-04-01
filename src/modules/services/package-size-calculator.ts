import * as path from 'node:path';
import * as fs from 'node:fs';
import fg from 'fast-glob';

import { PackageResolver } from '../packages/package-resolver';

import type { BasePackage } from '../packages/base-package';

const ASSET_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'woff', 'woff2', 'ttf', 'eot'];
const ASSET_PATTERNS = ASSET_EXTENSIONS.map((ext) => `**/*.${ext}`);

export class PackageSizeCalculator
{
	readonly #package: BasePackage;

	constructor(extensionPackage: BasePackage)
	{
		this.#package = extensionPackage;
	}

	getBundlesSize(): { css: number, js: number }
	{
		let result = { css: 0, js: 0 };
		const jsPath = this.#package.getOutputJsPath();
		const cssPath = this.#package.getOutputCssPath();
		const isExistJsBundle = fs.existsSync(jsPath);
		const isExistCssBundle = fs.existsSync(cssPath);

		if (isExistJsBundle || isExistCssBundle)
		{
			if (isExistJsBundle)
			{
				result.js = fs.statSync(jsPath).size;
			}

			if (isExistCssBundle)
			{
				result.css = fs.statSync(cssPath).size;
			}
		}
		else
		{
			const phpConfig = this.#package.getPhpConfig();
			const jsFiles = [phpConfig.get('js')].flat(2);
			const cssFiles = [phpConfig.get('css')].flat(2);

			result.js = this.#sumFileSizes(jsFiles);
			result.css = this.#sumFileSizes(cssFiles);
		}

		return result;
	}

	getAssetsSize(): number
	{
		const packagePath = this.#package.getPath();
		const referencedAssets = this.#findReferencedAssets();

		if (referencedAssets.size === 0)
		{
			return 0;
		}

		let total = 0;

		for (const relativePath of referencedAssets)
		{
			const fullPath = path.resolve(packagePath, relativePath);
			if (fs.existsSync(fullPath))
			{
				total += fs.statSync(fullPath).size;
			}
		}

		return total;
	}

	#findReferencedAssets(): Set<string>
	{
		const assets = new Set<string>();
		const assetRegex = new RegExp(`\\.(${ASSET_EXTENSIONS.join('|')})(?:[?#"']|$)`);

		// Check JS bundle for asset paths
		const jsPath = this.#package.getOutputJsPath();
		if (fs.existsSync(jsPath))
		{
			this.#extractAssetsFromFile(jsPath, assets, assetRegex);
		}

		// Check CSS bundle for url() references (skip data: URIs)
		const cssPath = this.#package.getOutputCssPath();
		if (fs.existsSync(cssPath))
		{
			this.#extractAssetsFromFile(cssPath, assets, assetRegex);
		}

		// Fall back to config.php js/css entries
		if (!fs.existsSync(jsPath) && !fs.existsSync(cssPath))
		{
			const phpConfig = this.#package.getPhpConfig();
			const jsFiles = [phpConfig.get('js')].flat(2).filter(Boolean);
			const cssFiles = [phpConfig.get('css')].flat(2).filter(Boolean);

			for (const file of [...jsFiles, ...cssFiles])
			{
				const fullPath = path.resolve(this.#package.getPath(), this.#normalizePath(file));
				if (fs.existsSync(fullPath))
				{
					this.#extractAssetsFromFile(fullPath, assets, assetRegex);
				}
			}
		}

		return assets;
	}

	#extractAssetsFromFile(filePath: string, assets: Set<string>, assetRegex: RegExp): void
	{
		const content = fs.readFileSync(filePath, 'utf-8');
		const dir = path.dirname(filePath);

		// Match url("path") in CSS and string literals in JS
		const urlPattern = /(?:url\(["']?|["'])([^"')]+)["']?\)?/g;
		let match: RegExpExecArray | null;

		while ((match = urlPattern.exec(content)) !== null)
		{
			const ref = match[1];

			// Skip data URIs, HTTP URLs, and absolute paths (served by platform, not bundled)
			if (ref.startsWith('data:') || ref.startsWith('http') || ref.startsWith('//'))
			{
				continue;
			}

			// Strip query string and hash
			const cleanRef = ref.split(/[?#]/)[0];

			if (!assetRegex.test(cleanRef + '"'))
			{
				continue;
			}

			// Resolve relative to the bundle directory
			if (cleanRef.startsWith('/'))
			{
				// Absolute path like /bitrix/js/ui/sign-up/dist/images/icon.svg
				// Match against the package's public path prefix
				const publicPath = this.#package.getPublicPath();
				if (publicPath && cleanRef.startsWith(publicPath))
				{
					assets.add(cleanRef.substring(publicPath.length));
				}
			}
			else
			{
				// Relative path like images/icon.svg
				const resolved = path.relative(
					this.#package.getPath(),
					path.resolve(dir, cleanRef),
				);
				assets.add(resolved);
			}
		}
	}

	async getDependenciesSize(): Promise<{ js: number; css: number; assets: number }>
	{
		const dependencies = await this.#package.getFlattedDependenciesTree();

		return dependencies.reduce((acc, dependency) => {
			const extension = PackageResolver.resolve(dependency.name);
			if (extension)
			{
				const calculator = new PackageSizeCalculator(extension);
				const { js, css } = calculator.getBundlesSize();
				acc.js += js;
				acc.css += css;
				acc.assets += calculator.getAssetsSize();
			}

			return acc;
		}, { js: 0, css: 0, assets: 0 });
	}

	async getTotalTransferredSize(): Promise<{ js: number; css: number; assets: number }>
	{
		const bundlesSize = this.getBundlesSize();
		const assetsSize = this.getAssetsSize();
		const dependenciesSize = await this.getDependenciesSize();

		return {
			js: bundlesSize.js + dependenciesSize.js,
			css: bundlesSize.css + dependenciesSize.css,
			assets: assetsSize + dependenciesSize.assets,
		};
	}

	#normalizePath(sourcePath: string): string
	{
		if (sourcePath.startsWith('/'))
		{
			const nameSegment = `${this.#package.getName().split('.').join('/')}/`;
			const [, relativePath] = sourcePath.split(nameSegment);

			return relativePath;
		}

		return sourcePath;
	}

	#sumFileSizes(files: string[]): number
	{
		return files.reduce((acc, filePath) => {
			if (filePath.length > 0)
			{
				const normalizedPath = this.#normalizePath(filePath);
				const fullPath = path.join(this.#package.getPath(), normalizedPath);
				if (fs.existsSync(fullPath))
				{
					acc += fs.statSync(fullPath).size;
				}
			}

			return acc;
		}, 0);
	}
}
