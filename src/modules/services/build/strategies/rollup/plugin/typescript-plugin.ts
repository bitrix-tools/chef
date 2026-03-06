import path from 'node:path';
import { createFilter } from '@rollup/pluginutils';
import type { Plugin } from 'rollup';
import type { CompilerOptions, Diagnostic } from 'typescript';

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

	const outputCache = new Map<string, { code: string; map: string | undefined }>();

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

	function formatDiagnostics(diagnostics: readonly Diagnostic[]): string[]
	{
		return diagnostics.map((diagnostic) => {
			return ts.formatDiagnosticsWithColorAndContext([diagnostic], {
				getCanonicalFileName: (fileName) => fileName,
				getCurrentDirectory: () => packageRoot,
				getNewLine: () => '\n',
			});
		});
	}

	return {
		name: 'bitrix-typescript',

		buildStart()
		{
			outputCache.clear();

			const fileNames = ts.sys.readDirectory(
				packageRoot,
				['.ts', '.tsx'],
				exclude,
				include,
			);

			if (fileNames.length === 0)
			{
				return;
			}

			const host = ts.createCompilerHost(mergedCompilerOptions);
			host.getCurrentDirectory = () => packageRoot;

			const program = ts.createProgram(fileNames, mergedCompilerOptions, host);

			const diagnostics = [
				...program.getSyntacticDiagnostics(),
				...program.getSemanticDiagnostics(),
			].filter((d) => {
				if (!d.file)
				{
					return true;
				}

				const filePath = d.file.fileName;

				if (filePath.includes('node_modules'))
				{
					return false;
				}

				if (filePath.endsWith('.js') || filePath.endsWith('.jsx'))
				{
					return false;
				}

				return filter(filePath);
			});

			const formatted = formatDiagnostics(diagnostics);
			for (const message of formatted)
			{
				this.warn(message);
			}

			program.emit(undefined, (fileName, text) => {
				const normalizedFileName = path.normalize(fileName);

				if (normalizedFileName.endsWith('.js'))
				{
					const sourceFileName = normalizedFileName
						.replace(path.normalize(mergedCompilerOptions.outDir!), packageRoot)
						.replace(/\.js$/, '.ts');

					outputCache.set(path.normalize(sourceFileName), {
						code: text,
						map: undefined,
					});
				}
				else if (normalizedFileName.endsWith('.js.map'))
				{
					const sourceFileName = normalizedFileName
						.replace(path.normalize(mergedCompilerOptions.outDir!), packageRoot)
						.replace(/\.js\.map$/, '.ts');

					const existing = outputCache.get(path.normalize(sourceFileName));
					if (existing)
					{
						existing.map = text;
					}
				}
			});
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

			const cached = outputCache.get(normalizedId);
			if (cached)
			{
				return {
					code: cached.code,
					map: cached.map ? JSON.parse(cached.map) : undefined,
				};
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