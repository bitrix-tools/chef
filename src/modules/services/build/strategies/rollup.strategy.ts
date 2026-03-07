import path from 'node:path';
import * as fs from 'node:fs';

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

import type { ParsedCommandLine } from 'typescript';

import nodeResolve from '@rollup/plugin-node-resolve';
import babelPlugin from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import jsonPlugin from '@rollup/plugin-json';
import urlPlugin from '@rollup/plugin-url';
import postcss from 'rollup-plugin-postcss';
import postcssUrl from 'postcss-url';
import postcssSvgo from 'postcss-svgo';
import autoprefixer from 'autoprefixer';

import presetEnv from '@babel/preset-env';
import flowStripTypesPlugin from '@babel/plugin-transform-flow-strip-types';
import externalHelpersPlugin from '@babel/plugin-external-helpers';
import transformClassesPlugin from '@babel/plugin-transform-classes';
import transformClassPropertiesPlugin from '@babel/plugin-transform-class-properties';
import transformPrivateMethodsPlugin from '@babel/plugin-transform-private-methods';
import transformPrivatePropertyInObjectPlugin from '@babel/plugin-transform-private-property-in-object';

import { Environment } from '../../../../environment/environment';
import { PackageResolver } from '../../../packages/package.resolver';
import { isExternalDependencyName } from '../../../../utils/is.external.dependency.name';
import { BuildStrategy } from './build.strategy';
import { FileFinder } from '../../../../utils/file.finder';
import concatPlugin from './rollup/plugin/concat-plugin';
import terserPlugin from '@rollup/plugin-terser';

import type {
	BuildResult,
	BuildOptions,
	BundleFileInfo,
	BuildCodeOptions,
	BuildCodeResult,
} from '../types/build.service.types';


export class RollupBuildStrategy extends BuildStrategy
{
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

			return acc;
		}, {})
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

	protected static createOnWarningHandler(): {
		warningsRef: RollupLog[],
		dependenciesRef: string[],
		onWarning: WarningHandlerWithDefault,
	}
	{
		const warningsRef: Array<RollupLog> = [];
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

			warningsRef.push(warning);
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

	async build(options: BuildOptions): Promise<BuildResult>
	{
		const { onWarning, warningsRef, dependenciesRef } = RollupBuildStrategy.createOnWarningHandler();
		const inputOptions: InputOptions = await this.#buildRollupInputOptions(options, onWarning, dependenciesRef);

		let bundle: RollupBuild;
		try
		{
			bundle = await rollup(inputOptions);
		}
		catch (error)
		{
			console.error(error);
			return {
				dependencies: [],
				bundles: [],
				warnings: [],
				errors: [error],
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
				errors: [error],
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

		const bundle: RollupBuild = await rollup(rollupInputOptions);

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

		return {
			code: outputEntry?.code,
			dependencies: [...dependenciesRef],
			warnings: [...warningsRef],
			errors: [],
		};
	}

	async generate(options: BuildOptions): Promise<BuildResult>
	{
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
				errors: [error],
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
				errors: [error],
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
		const { default: ts } = await import('typescript');
		const tsConfig = ts.readConfigFile(configPath, ts.sys.readFile);
		if (tsConfig.config && tsConfig.config.extends)
		{
			tsConfig.config.extends = path.join(path.dirname(configPath), tsConfig.config.extends);
		}

		const host = ts.createCompilerHost({}, true);

		const config = ts.parseJsonConfigFileContent(
			tsConfig.config,
			// @ts-ignore
			host,
			packageRoot,
		);

		const configDirname = path.dirname(configPath);

		config.options.paths = Object.entries(config.options.paths).reduce((acc, [extensionName, paths]) => {
			acc[extensionName] = paths.map((filePath) => {
				return path.join(configDirname, filePath.replace('./', ''));
			});

			return acc;
		}, {});

		return config;
	}

	async #createTypeScriptPlugin(tsConfig: ParsedCommandLine, packageRoot: string): Promise<Plugin>
	{
		const { default: bitrixTypescriptPlugin } = await import('./rollup/plugin/typescript-plugin');

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
			include: [`${packageRoot}/src/**`],
			exclude: [
				...(tsConfig?.raw?.exclude ?? []),
				`${packageRoot}/dist/**`,
				`${packageRoot}/test/**`,
			],
		});
	}

	async #createVuePlugin(options: BuildOptions): Promise<Plugin>
	{
		const { default: vuePlugin } = await import('unplugin-vue');

		return vuePlugin.rollup({
			isProduction: options.production ?? false,
		}) as Plugin;
	}

	async #buildRollupInputOptions(options: BuildOptions, onWarn: WarningHandlerWithDefault, dependenciesRef: string[]): Promise<InputOptions>
	{
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
				...((options.babel !== false) ? [babelPlugin({
					babelHelpers: 'external',
					presets: [
						[
							presetEnv,
							{
								targets: options.targets,
								modules: false,
							},
						],
					],
					plugins: [
						...(options.typescript ? [] : [flowStripTypesPlugin]),
						externalHelpersPlugin,
						...(options.transformClasses ? [transformClassPropertiesPlugin, transformPrivateMethodsPlugin, transformPrivatePropertyInObjectPlugin, transformClassesPlugin] : []),
					],
				})] : []),
				jsonPlugin(),
				postcss({
					extensions: ['.css'],
					extract: options.output.css || true,
					to: options.output.css,
					sourceMap: false,
					plugins: [
						autoprefixer({
							overrideBrowserslist: options.targets,
						}),
						postcssUrl({
							url: options?.cssImages?.type ?? 'inline',
							maxSize: options?.cssImages?.maxSize ?? 14,
							inline: (size: number) => {
								return size < (options?.cssImages?.maxSize ?? 14) * 1024;
							},
							fallback: 'copy',
							useHash: false,
						}),
						postcssSvgo({
							encode: true,
						}),
					],
				}),
				commonjs({
					sourceMap: false,
				}),
				urlPlugin({
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
				...(options.minify ? [terserPlugin(typeof options.minify === 'object' ? options.minify : {})] : []),
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
		return {
			input: 'source-code.js',
			plugins: [
				RollupBuildStrategy.createVirtualEntryPlugin({
					'source-code.js': options.code,
				}),
				RollupBuildStrategy.createNpmRemapPlugin(dependenciesRef),
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
				nodeResolve({
					browser: true,
				}),
				...((options.babel !== false) ? [babelPlugin({
					babelHelpers: 'external',
					presets: [
						[
							presetEnv,
							{
								targets: options.targets,
								modules: false,
							},
						],
					],
					plugins: [
						...(options.typescript ? [] : [flowStripTypesPlugin]),
						externalHelpersPlugin,
					],
				})] : []),
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
			sourcemap: options.sourcemap ? 'inline' : false,
		};
	}
}
