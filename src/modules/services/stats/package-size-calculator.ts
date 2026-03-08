import * as path from 'node:path';
import * as fs from 'node:fs';

import type { BasePackage } from '../../packages/base-package';
import { PackageResolver } from '../../packages/package.resolver';

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

	async getDependenciesSize(): Promise<{ js: number, css: number }>
	{
		const dependencies = await this.#package.getFlattedDependenciesTree();

		return dependencies.reduce((acc, dependency) => {
			const extension = PackageResolver.resolve(dependency.name);
			if (extension)
			{
				const sizes = new PackageSizeCalculator(extension);
				const { js, css } = sizes.getBundlesSize();
				acc.js += js;
				acc.css += css;
			}

			return acc;
		}, { js: 0, css: 0 });
	}

	async getTotalTransferredSize(): Promise<{ css: number, js: number }>
	{
		const bundlesSize = this.getBundlesSize();
		const dependenciesSize = await this.getDependenciesSize();

		return {
			js: bundlesSize.js + dependenciesSize.js,
			css: bundlesSize.css + dependenciesSize.css,
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
