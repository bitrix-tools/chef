import path from 'node:path';
import fs from 'node:fs';

import { createFilter } from '@rollup/pluginutils';

import type { Plugin } from 'rollup';
import type { CompilerOptions } from 'typescript';

export interface TypeScriptPluginOptions
{
	packageRoot: string;
	compilerOptions: CompilerOptions;
	include?: string[];
	exclude?: string[];
}

export default async function typescriptPlugin(options: TypeScriptPluginOptions): Promise<Plugin>
{
	const { default: ts } = await import('typescript');

	const {
		packageRoot,
		compilerOptions,
		include = [`${packageRoot}/src/**`],
		exclude = [
			`${packageRoot}/dist/**`,
			`${packageRoot}/test/**`,
		],
	} = options;

	const filter = createFilter(include, exclude);

	const mergedCompilerOptions: CompilerOptions = {
		...compilerOptions,
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		allowJs: true,
		checkJs: false,
		strict: true,
		noEmit: false,
		declaration: false,
		declarationMap: false,
		sourceMap: true,
		inlineSources: true,
		outDir: path.join(packageRoot, 'dist'),
		rootDir: packageRoot,
	};

	const tsExtensions = ['.ts', '.tsx', '.mts', '.cts'];

	return {
		name: 'bitrix-typescript',

		resolveId(source, importer)
		{
			if (!importer || path.extname(source))
			{
				return null;
			}

			const importerDir = path.dirname(importer);
			const resolved = path.resolve(importerDir, source);

			for (const ext of tsExtensions)
			{
				const candidate = resolved + ext;
				if (fs.existsSync(candidate))
				{
					return candidate;
				}
			}

			return null;
		},

		transform(code, id)
		{
			if (/\.vue\?.*&lang\.ts/.test(id))
			{
				const result = ts.transpileModule(code, {
					compilerOptions: {
						...mergedCompilerOptions,
						sourceMap: true,
					},
					fileName: id,
				});

				return {
					code: result.outputText,
					map: result.sourceMapText ? JSON.parse(result.sourceMapText) : undefined,
				};
			}

			const normalizedId = path.normalize(id);

			if (!filter(normalizedId))
			{
				return null;
			}

			if (!/\.[cm]?tsx?$/.test(normalizedId))
			{
				return null;
			}

			const result = ts.transpileModule(code, {
				compilerOptions: {
					...mergedCompilerOptions,
					sourceMap: true,
				},
				fileName: normalizedId,
			});

			return {
				code: result.outputText,
				map: result.sourceMapText ? JSON.parse(result.sourceMapText) : undefined,
			};
		},
	};
}
