import path from 'node:path';

import fg from 'fast-glob';

import { ChefConfigManager } from '../config/project/chef-config-manager';
import { validateBuildOptions } from '../config/project/chef-config-validator';
import { DeclarationEmitter } from '../engines/build/declaration-emitter';
import { Environment } from '../../environment/environment';
import { FileFinder } from '../../utils/file-finder';
import { loadTsConfig } from '../../utils/load-tsconfig';
import type { BasePackage } from '../packages/base-package';
import type { BuildEngine } from '../engines/build/build-engine';
import type { BuildOptions, BuildResult } from '../engines/build/build-types';

export class PackageBuilder
{
	readonly #package: BasePackage;

	constructor(extensionPackage: BasePackage)
	{
		this.#package = extensionPackage;
	}

	async build(options: { force?: boolean } = {}): Promise<BuildResult>
	{
		const buildEngine = await PackageBuilder.getBuildEngine();
		const buildOptions = this.#getBuildOptions();

		const validation = options.force ? null : await this.#validateBuildOptions(buildOptions);
		if (validation && 'denied' in validation)
		{
			return validation.denied;
		}

		const buildResult = await buildEngine.build(buildOptions);

		if (buildResult.errors.length === 0 && buildOptions.emitDeclaration && buildOptions.typescript)
		{
			await this.#emitDeclaration(buildOptions);
		}

		if (validation && 'warnings' in validation)
		{
			buildResult.warnings.push(...validation.warnings.map((message) => ({ message })));
		}

		const phpConfig = this.#package.getPhpConfig();

		// Filter out dependencies that are already included in the bundle
		const includes = new Set<string>(phpConfig.get('includes') ?? []);
		const dependencies = buildResult.dependencies.filter(dep => !includes.has(dep));

		phpConfig.set('rel', dependencies);

		if (this.#package.shouldUpdatePhpConfig())
		{
			phpConfig.save(this.#package.getPhpConfigFilePath(), this.#package.getName());
		}

		return buildResult;
	}

	async generate(): Promise<BuildResult>
	{
		const buildEngine = await PackageBuilder.getBuildEngine();
		const buildOptions = this.#getBuildOptions();

		const validation = await this.#validateBuildOptions(buildOptions);
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

	#getBuildOptions(): BuildOptions
	{
		const bundleConfig = this.#package.getBundleConfig();
		const chefConfig = ChefConfigManager.getInstance().getConfig();
		const defaults = chefConfig.defaults;
		const enforce = chefConfig.enforce;

		const production = bundleConfig.get('production');

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
			packageName: this.#package.getName(),
			typescript: this.#package.isTypeScriptMode(),
			vue: this.#hasVueFiles(),
			concat: bundleConfig.get('concat'),
			cssImages: bundleConfig.get('cssImages'),
			resolveFiles: bundleConfig.get('resolveFilesImport'),
			minify: bundleConfig.get('minification'),
			sourceMaps: enforce?.sourceMaps
				?? (bundleConfig.has('sourceMaps')
					? bundleConfig.get('sourceMaps')
					: (defaults?.sourceMaps ?? true)),
			standalone: bundleConfig.get('standalone').enabled,
			standaloneRemap: bundleConfig.get('standalone').remap,
			standaloneExposeNamespaces: bundleConfig.get('standalone').exposeNamespaces,
			resolve: bundleConfig.get('resolveNodeModules'),
			babel: enforce?.babel ?? bundleConfig.get('babel'),
			transformClasses: bundleConfig.get('transformClasses'),
			treeshake: bundleConfig.get('treeshake'),
			customPlugins: bundleConfig.get('plugins'),
			production,
			emitDeclaration: enforce?.emitDeclaration
				?? (bundleConfig.has('emitDeclaration')
					? bundleConfig.get('emitDeclaration')
					: (defaults?.emitDeclaration ?? true)),
			safeNamespaces: bundleConfig.get('safeNamespaces'),
			baseline: enforce?.baseline
				?? (bundleConfig.has('baseline')
					? bundleConfig.get('baseline')
					: (defaults?.baseline ?? bundleConfig.get('baseline'))),
		};
	}

	async #validateBuildOptions(buildOptions: BuildOptions): Promise<{ denied: BuildResult } | { warnings: string[] } | null>
	{
		const chefConfig = ChefConfigManager.getInstance().getConfig();
		const issues = await validateBuildOptions(buildOptions, chefConfig);

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
					warnings: warnings.map((w) => ({ code: w.code, message: w.message })),
					errors: errors.map((e) => ({ code: e.code, message: e.message })),
					standalone: buildOptions.standalone ?? false,
				},
			};
		}

		return { warnings: warnings.map((w) => w.message) };
	}

	async #emitDeclaration(options: BuildOptions): Promise<void>
	{
		const outputPath = options.output.js.replace(/\.js$/, '.d.ts');
		const emitter = new DeclarationEmitter();

		const tsConfigPath = FileFinder.findUpFile({
			fileName: 'tsconfig.json',
			fromDir: path.dirname(options.input),
			rootDir: Environment.getRoot() ?? undefined,
		});

		let compilerOptions: import('typescript').CompilerOptions | undefined;
		if (typeof tsConfigPath === 'string' && tsConfigPath.length > 0)
		{
			const tsConfig = await loadTsConfig(tsConfigPath, options.packageRoot);
			compilerOptions = tsConfig.options;
		}

		await emitter.emit({
			packageRoot: options.packageRoot,
			input: options.input,
			namespace: options.namespace,
			outputPath,
			compilerOptions,
		});
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
