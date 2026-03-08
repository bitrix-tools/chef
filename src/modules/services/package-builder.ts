import * as path from 'node:path';
import fg from 'fast-glob';

import type { BasePackage } from '../packages/base-package';
import type { BuildEngine } from '../engines/build/build-engine';
import type { BuildOptions, BuildResult } from '../engines/build/build-types';
import { ChefConfigManager } from '../config/project/chef-config-manager';
import { validateBuildOptions } from '../config/project/chef-config-validator';

export class PackageBuilder
{
	readonly #package: BasePackage;

	constructor(extensionPackage: BasePackage)
	{
		this.#package = extensionPackage;
	}

	async build(options: { production?: boolean } = {}): Promise<BuildResult>
	{
		const buildEngine = await PackageBuilder.getBuildEngine();
		const buildOptions = this.#getBuildOptions(options);

		const validation = this.#validateBuildOptions(buildOptions);
		if (validation && 'denied' in validation)
		{
			return validation.denied;
		}

		const buildResult = await buildEngine.build(buildOptions);

		if (validation && 'warnings' in validation)
		{
			buildResult.warnings.push(...validation.warnings.map((message) => ({ message })));
		}

		const phpConfig = this.#package.getPhpConfig();

		// Filter out dependencies that are already included in the bundle
		const includes = new Set<string>(phpConfig.get('includes') ?? []);
		const dependencies = buildResult.dependencies.filter(dep => !includes.has(dep));

		phpConfig.set('rel', dependencies);
		phpConfig.save(this.#package.getPhpConfigFilePath(), this.#package.getName());

		return buildResult;
	}

	async generate(options: { production?: boolean } = {}): Promise<BuildResult>
	{
		const buildEngine = await PackageBuilder.getBuildEngine();
		const buildOptions = this.#getBuildOptions(options);

		const validation = this.#validateBuildOptions(buildOptions);
		if (validation && 'denied' in validation)
		{
			return validation.denied;
		}

		const buildResult = await buildEngine.generate(buildOptions);

		if (validation && 'warnings' in validation)
		{
			buildResult.warnings.push(...validation.warnings.map((message) => ({ message })));
		}

		return buildResult;
	}

	#getBuildOptions(options: { production?: boolean } = {}): BuildOptions
	{
		const production = options.production ?? false;
		const bundleConfig = this.#package.getBundleConfig();
		const chefConfig = ChefConfigManager.getInstance().getConfig();
		const defaults = chefConfig.defaults;
		const enforce = chefConfig.enforce;

		return {
			input: this.#package.getInputPath(),
			output: {
				js: this.#package.getOutputJsPath(),
				css: this.#package.getOutputCssPath(),
			},
			packageRoot: this.#package.getPath(),
			publicPath: this.#package.getPublicPath(),
			targets: [enforce?.targets ?? this.#package.getTargets() ?? defaults?.targets].flat(),
			namespace: bundleConfig.get('namespace'),
			typescript: this.#package.isTypeScriptMode(),
			vue: this.#hasVueFiles(),
			concat: bundleConfig.get('concat'),
			cssImages: bundleConfig.get('cssImages'),
			resolveFiles: bundleConfig.get('resolveFilesImport'),
			minify: bundleConfig.has('minification')
				? bundleConfig.get('minification')
				: production,
			sourceMaps: enforce?.sourceMaps
				?? (bundleConfig.has('sourceMaps')
					? bundleConfig.get('sourceMaps')
					: (defaults?.sourceMaps ?? !production)),
			standalone: bundleConfig.get('standalone'),
			resolve: bundleConfig.get('resolveNodeModules'),
			babel: enforce?.babel ?? bundleConfig.get('babel'),
			transformClasses: bundleConfig.get('transformClasses'),
			customPlugins: bundleConfig.get('plugins'),
			production,
		};
	}

	#validateBuildOptions(buildOptions: BuildOptions): { denied: BuildResult } | { warnings: string[] } | null
	{
		const chefConfig = ChefConfigManager.getInstance().getConfig();
		const issues = validateBuildOptions(buildOptions, chefConfig);

		if (issues.length === 0)
		{
			return null;
		}

		const errors = issues.filter((i) => i.severity === 'error');
		const warnings = issues.filter((i) => i.severity === 'warning');

		if (errors.length > 0)
		{
			return {
				denied: {
					dependencies: [],
					bundles: [],
					warnings: warnings.map((w) => ({ message: w.message })),
					errors: errors.map((e) => ({ message: e.message })),
					standalone: buildOptions.standalone ?? false,
				},
			};
		}

		return { warnings: warnings.map((w) => w.message) };
	}

	#hasVueFiles(): boolean
	{
		return fg.sync('src/**/*.vue', { cwd: this.#package.getPath() }).length > 0;
	}

	static #buildEngine: Promise<BuildEngine> | null = null;

	static getBuildEngine(): Promise<BuildEngine>
	{
		if (!PackageBuilder.#buildEngine)
		{
			PackageBuilder.#buildEngine = (async () => {
				const [
					{ BuildEngine },
					{ RollupBuildStrategy },
				] = await Promise.all([
					import('../engines/build/build-engine'),
					import('../engines/build/rollup/rollup-strategy'),
				]);

				return new BuildEngine(new RollupBuildStrategy());
			})();
		}

		return PackageBuilder.#buildEngine;
	}
}
