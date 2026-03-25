import path from 'node:path';
import fs from 'node:fs';

import {
	rollup,
	type InputOptions,
	type OutputOptions,
	type RollupLog,
	type Plugin,
	type RollupBuild,
	type RollupOutput,
	type WarningHandlerWithDefault,
	type OutputChunk,
} from 'rollup';

import { Environment } from '../../../../environment/environment';
import { PackageResolver } from '../../../packages/package-resolver';
import { isExternalDependencyName } from '../../../../utils/is-external-dependency-name';
import { BuildStrategy } from '../build-strategy';
import { CF } from '../../../../diagnostics/diagnostic-codes';
import { FileFinder } from '../../../../utils/file-finder';
import { loadTsConfig } from '../../../../utils/load-tsconfig';
import concatPlugin from './plugins/concat';
import stripCommentsPlugin from './plugins/strip-comments';
import safeNamespacesPlugin from './plugins/safe-namespaces';

import type { ParsedCommandLine } from 'typescript';
import type {
	BuildDiagnostic,
	BuildResult,
	BuildOptions,
	BundleFileInfo,
	BuildCodeOptions,
	BuildCodeResult,
} from '../build-types';

export class RollupBuildStrategy extends BuildStrategy
{
	#buildCodeCache: RollupBuild['cache'] = undefined;

	protected static calculateBundlesSize(output: RollupOutput['output']): BundleFileInfo[]
	{
		return output.map((chunk) => {
			const code = chunk.type === 'asset' ? chunk.source : chunk.code;
			const size = Buffer.byteLength(code, 'utf8');

			return {
				fileName: chunk.fileName,
				size,
			};
		});
	}

	protected static makeGlobals(dependencies: string[]): Record<string, string>
	{
		return dependencies.reduce((acc, dependency: string) => {
			const extension = PackageResolver.resolve(dependency);
			if (extension)
			{
				return { ...acc, ...extension.getGlobal() };
			}

			return { ...acc, [dependency]: RollupBuildStrategy.guessNamespace(dependency) };
		}, {})
	}

	protected static guessNamespace(dependency: string): string
	{
		const root = Environment.getRoot();
		if (!root)
		{
			return 'window';
		}

		if (Environment.getType() === 'source')
		{
			return 'BX';
		}

		const segments = dependency.split('.');
		const bitrixPath = path.join(root, 'bitrix', 'js', ...segments);
		if (fs.existsSync(bitrixPath))
		{
			return 'BX';
		}

		return 'window';
	}

	static readonly #npmToBitrixMap: Record<string, string> = {
		'vue': 'ui.vue3',
	};

	protected static createEnvReplacePlugin(production: boolean): Plugin
	{
		const replacements: Record<string, string> = {
			'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
			'import.meta.env.MODE': JSON.stringify(production ? 'production' : 'development'),
			'import.meta.env.PROD': String(production),
			'import.meta.env.DEV': String(!production),
		};

		const keys = Object.keys(replacements);

		return {
			name: 'env-replace',
			transform(code)
			{
				const matched = keys.filter((key) => code.includes(key));
				if (matched.length === 0)
				{
					return null;
				}

				let result = code;
				for (const key of matched)
				{
					result = result.replaceAll(key, replacements[key]);
				}

				return {
					code: result,
					map: null,
				};
			},
		};
	}

	protected static createNpmRemapPlugin(dependenciesRef?: string[]): Plugin
	{
		return {
			name: 'npm-to-bitrix-remap',
			resolveId(id)
			{
				if (id in RollupBuildStrategy.#npmToBitrixMap)
				{
					const mapped = RollupBuildStrategy.#npmToBitrixMap[id];
					dependenciesRef?.push(mapped);

					return { id: mapped, external: true };
				}

				return null;
			},
		};
	}

	protected static toDiagnostic(error: unknown, code: string = CF.SYNTAX_ERROR): BuildDiagnostic
	{
		const rollupCode = (error instanceof Error && 'code' in error && typeof error.code === 'string')
			? error.code
			: undefined;

		const errorCode = rollupCode?.startsWith('CF')
			? rollupCode
			: (rollupCode && RollupBuildStrategy.#rollupWarningCodes[rollupCode]) ?? code;

		if (error instanceof Error && 'loc' in error)
		{
			const loc = (error as any).loc;

			return {
				code: errorCode,
				message: error.message,
				frame: (error as any).frame,
				loc: loc?.file ? { file: loc.file, line: loc.line, column: loc.column } : undefined,
			};
		}

		return {
			code: errorCode,
			message: error instanceof Error ? error.message : String(error),
		};
	}

	static readonly #rollupWarningCodes: Record<string, string> = {
		CIRCULAR_DEPENDENCY: CF.CIRCULAR_DEPENDENCY,
		MISSING_EXPORT: CF.MISSING_EXPORT,
		THIS_IS_UNDEFINED: CF.THIS_IS_UNDEFINED,
		EVAL: CF.EVAL,
		MISSING_GLOBAL_NAME: CF.MISSING_GLOBAL_NAME,
		UNUSED_EXTERNAL_IMPORT: CF.UNUSED_EXTERNAL_IMPORT,
		UNRESOLVED_IMPORT: CF.UNRESOLVED_IMPORT,
		MISSING_NAME_OPTION_FOR_IIFE_EXPORT: CF.MISSING_IIFE_NAME,
		PLUGIN_WARNING: CF.PLUGIN_WARNING,
	};

	protected static createOnWarningHandler(): {
		warningsRef: BuildDiagnostic[],
		dependenciesRef: string[],
		onWarning: WarningHandlerWithDefault,
	}
	{
		const warningsRef: Array<BuildDiagnostic> = [];
		const dependenciesRef: Array<string> = [];
		const onWarning = (warning: RollupLog): void => {
			if (
				warning.code === 'UNRESOLVED_IMPORT'
				&& isExternalDependencyName(warning.exporter)
			)
			{
				dependenciesRef.push(warning.exporter);

				return;
			}

			const code = (warning.code && RollupBuildStrategy.#rollupWarningCodes[warning.code]) ?? CF.UNKNOWN_BUILD_WARNING;

			warningsRef.push({
				code,
				message: warning.message,
				frame: warning.frame,
				loc: warning.loc?.file
					? { file: warning.loc.file, line: warning.loc.line, column: warning.loc.column }
					: undefined,
			});
		};

		return {
			warningsRef,
			dependenciesRef,
			onWarning,
		};
	}

	protected static createVirtualEntryPlugin(entries: Record<string, string>): Plugin
	{
		return {
			name: 'virtual-module-plugin',
			resolveId(id) {
				if (id in entries)
				{
					return id;
				}

				return null;
			},
			load(id) {
				if (id in entries)
				{
					return entries[id];
				}

				return null;
			},
		}
	}

	protected static createStandalonePlugin(): Plugin
	{
		return {
			name: 'standalone-plugin',
			resolveId(id) {
				const extension = PackageResolver.resolve(id);
				if (extension)
				{
					return extension.getInputPath();
				}

				return null;
			},
		}
	}

	protected static createTerserPlugin(options: import('terser').MinifyOptions): Plugin
	{
		return {
			name: 'terser',
			async renderChunk(code) {
				const { minify } = await import('terser');
				const result = await minify(code, options);

				if (!result.code && result.code !== '')
				{
					const { ChefError } = await import('../../../../diagnostics/chef-error');
					throw new ChefError(CF.MINIFICATION_ERROR, 'Terser returned empty result');
				}

				return {
					code: result.code!,
					map: result.map ? (typeof result.map === 'string' ? JSON.parse(result.map) : result.map) : null,
				};
			},
		};
	}

	async build(options: BuildOptions): Promise<BuildResult>
	{
		if (options.typescript)
		{
			const typeCheckResult = await this.#checkTypes(options);
			if (typeCheckResult.errors.length > 0)
			{
				return {
					dependencies: [],
					bundles: [],
					warnings: [],
					errors: typeCheckResult.errors,
					standalone: options.standalone ?? false,
				};
			}
		}

		const { onWarning, warningsRef, dependenciesRef } = RollupBuildStrategy.createOnWarningHandler();
		const inputOptions: InputOptions = await this.#buildRollupInputOptions(options, onWarning, dependenciesRef);

		let bundle: RollupBuild;
		try
		{
			bundle = await rollup(inputOptions);
		}
		catch (error)
		{
			return {
				dependencies: [],
				bundles: [],
				warnings: [],
				errors: [RollupBuildStrategy.toDiagnostic(error)],
				standalone: options.standalone ?? false,
			};
		}

		const outputOptions: OutputOptions = this.#buildRollupOutputOptions(options);
		const globals = RollupBuildStrategy.makeGlobals(dependenciesRef);

		let result: RollupOutput;
		try
		{
			result = await bundle.write({ ...outputOptions, globals })
		}
		catch (error)
		{
			return {
				dependencies: [],
				bundles: [],
				warnings: [],
				errors: [RollupBuildStrategy.toDiagnostic(error)],
				standalone: options.standalone ?? false,
			};
		}

		await bundle.close();

		const bundlesSize = RollupBuildStrategy.calculateBundlesSize(result.output);
		const sortedDependencies = RollupBuildStrategy.sortDependencies(dependenciesRef)

		return {
			dependencies: sortedDependencies,
			bundles: bundlesSize,
			warnings: [...warningsRef],
			errors: [],
			standalone: options.standalone ?? false,
		};
	}

	async buildCode(options: BuildCodeOptions): Promise<BuildCodeResult>
	{
		const { onWarning, warningsRef, dependenciesRef } = RollupBuildStrategy.createOnWarningHandler();
		const rollupInputOptions: InputOptions = await this.#buildRollupBuildCodeInputOptions(
			options,
			onWarning,
			dependenciesRef,
		);

		const bundle: RollupBuild = await rollup({
			...rollupInputOptions,
			cache: this.#buildCodeCache,
		});
		this.#buildCodeCache = bundle.cache;

		const outputOptions: OutputOptions = this.#buildRollupBuildCodeOutputOptions(options);
		const globals = RollupBuildStrategy.makeGlobals(dependenciesRef);
		const result: RollupOutput = await bundle.generate({
			...outputOptions,
			globals: {
				...globals,
				mocha: 'window',
				chai: 'window',
				sinon: 'window',
			},
		});

		await bundle.close();

		const outputEntry = result.output.at(0) as OutputChunk;
		const cssAsset = result.output.find(
			(item) => item.type === 'asset' && item.fileName.endsWith('.css'),
		);

		return {
			code: outputEntry?.code,
			css: (cssAsset?.type === 'asset' ? cssAsset.source as string : '') ?? '',
			map: outputEntry?.map ?? null,
			dependencies: [...dependenciesRef],
			warnings: [...warningsRef],
			errors: [],
		};
	}

	async generate(options: BuildOptions): Promise<BuildResult>
	{
		if (options.typescript)
		{
			const typeCheckResult = await this.#checkTypes(options);
			if (typeCheckResult.errors.length > 0)
			{
				return {
					dependencies: [],
					bundles: [],
					warnings: [],
					errors: typeCheckResult.errors,
					standalone: options.standalone ?? false,
				};
			}
		}

		const { onWarning, warningsRef, dependenciesRef } = RollupBuildStrategy.createOnWarningHandler();
		const inputOptions: InputOptions = await this.#buildRollupInputOptions(options, onWarning, dependenciesRef);

		let bundle: RollupBuild;
		try
		{
			bundle = await rollup(inputOptions);
		}
		catch (error)
		{
			return {
				dependencies: [],
				bundles: [],
				warnings: [],
				errors: [RollupBuildStrategy.toDiagnostic(error)],
				standalone: options.standalone ?? false,
			};
		}

		const outputOptions: OutputOptions = this.#buildRollupOutputOptions(options);
		const globals = RollupBuildStrategy.makeGlobals(dependenciesRef);

		let result: RollupOutput;
		try
		{
			result = await bundle.generate({ ...outputOptions, globals })
		}
		catch (error)
		{
			return {
				dependencies: [],
				bundles: [],
				warnings: [],
				errors: [RollupBuildStrategy.toDiagnostic(error)],
				standalone: options.standalone ?? false,
			};
		}

		await bundle.close();

		const bundlesSize = RollupBuildStrategy.calculateBundlesSize(result.output);
		const sortedDependencies = RollupBuildStrategy.sortDependencies(dependenciesRef)

		return {
			dependencies: sortedDependencies,
			bundles: bundlesSize,
			warnings: [...warningsRef],
			errors: [],
			standalone: options.standalone ?? false,
		};
	}

	async #loadTsConfig(configPath: string, packageRoot: string): Promise<ParsedCommandLine>
	{
		return loadTsConfig(configPath, packageRoot);
	}

	async #createTypeScriptPlugin(tsConfig: ParsedCommandLine, packageRoot: string): Promise<Plugin>
	{
		const { default: bitrixTypescriptPlugin } = await import('./plugins/typescript');

		const typesPath = (() => {
			const devExtension = PackageResolver.resolve('ui.dev');
			if (devExtension)
			{
				return devExtension.getInputPath();
			}

			return '';
		})();

		return bitrixTypescriptPlugin({
			packageRoot,
			compilerOptions: {
				paths: tsConfig.options.paths,
				baseUrl: tsConfig.options.baseUrl,
				types: typesPath ? [typesPath] : [],
			},
			include: [`${packageRoot}/**`],
			exclude: [
				...(tsConfig?.raw?.exclude ?? []),
				`${packageRoot}/dist/**`,
			],
		});
	}

	async #checkTypes(options: BuildOptions): Promise<import('./plugins/typescript').TypeCheckResult>
	{
		const { checkTypes } = await import('./plugins/typescript');

		const tsConfigPath = FileFinder.findUpFile({
			fileName: 'tsconfig.json',
			fromDir: path.dirname(options.input),
			rootDir: Environment.getRoot() ?? undefined,
		});

		let compilerOptions: import('typescript').CompilerOptions | undefined;
		if (typeof tsConfigPath === 'string' && tsConfigPath.length > 0)
		{
			const tsConfig = await this.#loadTsConfig(tsConfigPath, options.packageRoot);
			compilerOptions = tsConfig.options;
		}

		return checkTypes({
			packageRoot: options.packageRoot,
			compilerOptions,
		});
	}

	async #createVuePlugin(options: BuildOptions): Promise<Plugin>
	{
		const { default: vuePlugin } = await import('unplugin-vue');

		return vuePlugin.rollup({
			isProduction: options.production ?? false,
		}) as Plugin;
	}

	async #loadBuildPlugins(options: BuildOptions)
	{
		const [
			{ default: nodeResolve },
			{ default: commonjs },
			{ default: jsonPlugin },
			{ default: urlPlugin },
			{ default: cssPlugin },
		] = await Promise.all([
			import('@rollup/plugin-node-resolve'),
			import('@rollup/plugin-commonjs'),
			import('@rollup/plugin-json'),
			import('@rollup/plugin-url'),
			import('./plugins/css'),
		]);

		const babelPlugin = await this.#loadBabelPlugin(options);

		return {
			nodeResolve,
			commonjs,
			jsonPlugin,
			urlPlugin,
			cssPlugin,
			babelPlugin,
		};
	}

	async #loadBabelPlugin(options: { babel?: boolean, typescript?: boolean, standalone?: boolean, targets: string[], transformClasses?: boolean }): Promise<Plugin | null>
	{
		if (options.babel === false)
		{
			return null;
		}

		const [
			{ default: babelPlugin },
			{ default: presetEnv },
			{ default: flowStripTypesPlugin },
			{ default: externalHelpersPlugin },
		] = await Promise.all([
			import('@rollup/plugin-babel'),
			import('@babel/preset-env'),
			import('@babel/plugin-transform-flow-strip-types'),
			import('@babel/plugin-external-helpers'),
		]);

		const babelTransformPlugins = [
			...(options.typescript && !options.standalone ? [] : [flowStripTypesPlugin]),
			externalHelpersPlugin,
		];

		if (options.transformClasses)
		{
			const [
				{ default: transformClassProperties },
				{ default: transformPrivateMethods },
				{ default: transformPrivatePropertyInObject },
				{ default: transformClasses },
			] = await Promise.all([
				import('@babel/plugin-transform-class-properties'),
				import('@babel/plugin-transform-private-methods'),
				import('@babel/plugin-transform-private-property-in-object'),
				import('@babel/plugin-transform-classes'),
			]);

			babelTransformPlugins.push(
				transformClassProperties,
				transformPrivateMethods,
				transformPrivatePropertyInObject,
				transformClasses,
			);
		}

		const extensions = ['.js', '.jsx', '.mjs'];
		if (options.typescript && options.transformClasses)
		{
			extensions.push('.ts', '.tsx');
		}

		return babelPlugin({
			babelHelpers: 'external',
			extensions,
			presets: [
				[
					presetEnv,
					{
						targets: options.targets,
						modules: false,
					},
				],
			],
			plugins: babelTransformPlugins,
		});
	}

	async #buildRollupInputOptions(options: BuildOptions, onWarn: WarningHandlerWithDefault, dependenciesRef: string[]): Promise<InputOptions>
	{
		const {
			nodeResolve,
			commonjs,
			jsonPlugin,
			urlPlugin,
			cssPlugin,
			babelPlugin,
		} = await this.#loadBuildPlugins(options);

		return {
			input: options.input,
			plugins: [
				RollupBuildStrategy.createEnvReplacePlugin(options.production ?? false),
				RollupBuildStrategy.createNpmRemapPlugin(dependenciesRef),
				...(() => {
					if (options.standalone)
					{
						return [RollupBuildStrategy.createStandalonePlugin()];
					}

					return [];
				})(),
				await (async () => {
					if (options.vue)
					{
						return this.#createVuePlugin(options);
					}

					return null;
				})(),
				await (async () => {
					if (options.typescript)
					{
						const tsConfigPath = FileFinder.findUpFile({
							fileName: 'tsconfig.json',
							fromDir: path.dirname(options.input),
							rootDir: Environment.getRoot() ?? undefined,
						});

						if (typeof tsConfigPath === 'string' && tsConfigPath.length > 0)
						{
							const tsConfig = await this.#loadTsConfig(
								tsConfigPath,
								options.packageRoot,
							);

							return await this.#createTypeScriptPlugin(
								tsConfig,
								options.packageRoot,
							);
						}
					}

					return Promise.resolve();
				})(),
				(() => {
					if (options.resolve || options.standalone)
					{
						return nodeResolve({
							browser: true,
						});
					}

					return null;
				})(),
				...(babelPlugin ? [babelPlugin] : []),
				jsonPlugin(),
				cssPlugin({
					extract: options.output.css,
					targets: options.targets,
					cssImages: options.cssImages,
					packageRoot: options.packageRoot,
				}),
				commonjs({
					sourceMap: false,
				}),
				urlPlugin({
					limit: 0,
					emitFiles: true,
					fileName: 'assets/[name][extname]',
					publicPath: path.join(
						options.publicPath,
						path.relative(
							options.packageRoot,
							path.dirname(
								options.output.js,
							),
						),
						'/',
					),
				}),
				concatPlugin({
					jsFiles: (options.concat?.js ?? []).map(
						(filePath) => path.resolve(options.packageRoot, filePath),
					),
					cssFiles: (options.concat?.css ?? []).map(
						(filePath) => path.resolve(options.packageRoot, filePath),
					),
				}),
				...(options.customPlugins ?? []),
				...(options.typescript ? [stripCommentsPlugin({ banner: '/* eslint-disable */' })] : []),
				...(options.minify ? [RollupBuildStrategy.createTerserPlugin(typeof options.minify === 'object' ? options.minify : {})] : []),
				...(options.safeNamespaces ? [safeNamespacesPlugin()] : []),
			],
			onwarn: onWarn,
			treeshake: {
				moduleSideEffects: false,
				propertyReadSideEffects: false,
				tryCatchDeoptimization: false,
			},
		}
	}

	#buildRollupOutputOptions(options: BuildOptions): OutputOptions
	{
		return {
			file: options.output.js,
			name: options?.namespace ?? 'window',
			format: 'iife',
			banner: '/* eslint-disable */',
			extend: true,
			sourcemap: options?.sourceMaps ?? true,
		};
	}

	async #buildRollupBuildCodeInputOptions(options: BuildCodeOptions, onWarning: WarningHandlerWithDefault, dependenciesRef: string[]): Promise<InputOptions>
	{
		const [
			{ default: nodeResolve },
			{ default: commonjs },
			{ default: jsonPlugin },
			babelPlugin,
		] = await Promise.all([
			import('@rollup/plugin-node-resolve'),
			import('@rollup/plugin-commonjs'),
			import('@rollup/plugin-json'),
			this.#loadBabelPlugin(options),
		]);

		return {
			input: 'source-code.js',
			plugins: [
				RollupBuildStrategy.createVirtualEntryPlugin({
					'source-code.js': options.code,
				}),
				RollupBuildStrategy.createNpmRemapPlugin(dependenciesRef),
				RollupBuildStrategy.createEnvReplacePlugin(false),
				...(options.standalone ? [RollupBuildStrategy.createStandalonePlugin()] : []),
				await (async () => {
					if (options.typescript)
					{
						const tsConfigPath = FileFinder.findUpFile({
							fileName: 'tsconfig.json',
							fromDir: options.packageRoot,
							rootDir: Environment.getRoot(),
						});

						if (typeof tsConfigPath === 'string' && tsConfigPath.length > 0)
						{
							const tsConfig = await this.#loadTsConfig(
								tsConfigPath,
								options.packageRoot,
							);

							return await this.#createTypeScriptPlugin(
								tsConfig,
								options.packageRoot,
							);
						}
					}

					return null;
				})(),
				(await import('./plugins/css')).default({
					extract: 'bundle.css',
					targets: options.targets,
					packageRoot: options.packageRoot,
				}),
				nodeResolve({
					browser: true,
				}),
				...(babelPlugin ? [babelPlugin] : []),
				jsonPlugin(),
				commonjs({
					sourceMap: false,
				}),
			],
			onwarn: onWarning,
			treeshake: false,
			external: [
				'mocha',
				'chai',
				'sinon',
			],
		}
	}

	#buildRollupBuildCodeOutputOptions(options: BuildCodeOptions): OutputOptions
	{
		return {
			file: 'source-code.bundle.js',
			name: options.namespace,
			format: 'iife',
			banner: '/* eslint-disable */',
			extend: true,
			intro: options.standalone ? 'var global = globalThis; var exports = {}; var module = { exports: exports };' : undefined,
			sourcemap: options.sourcemap ?? false,
		};
	}
}
