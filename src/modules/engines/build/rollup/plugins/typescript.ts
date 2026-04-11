import path from 'node:path';
import fs from 'node:fs';

import { createFilter } from '@rollup/pluginutils';

import type { Plugin } from 'rollup';
import type { CompilerOptions, Diagnostic } from 'typescript';
import type { BuildDiagnostic } from '../../build-types';

import { CF } from '../../../../../diagnostics/diagnostic-codes';
import { createPathFilter } from '../../../../../utils/create-path-filter';

export interface TypeScriptPluginOptions
{
	packageRoot: string;
	compilerOptions: CompilerOptions;
	include?: string[];
	exclude?: string[];
}

export interface TypeCheckOptions
{
	packageRoot: string;
	compilerOptions?: CompilerOptions;
	files?: string[];
	exclude?: string[];
}

export interface TypeCheckResult
{
	errors: BuildDiagnostic[];
}

const tsExtensions = ['.ts', '.tsx', '.mts', '.cts'];

/**
 * TypeScript transpileModule outputs 4-space indentation by default.
 * Normalize to 2-space so the tab-indent plugin converts correctly (2 spaces → 1 tab).
 */
function normalizeIndent(code: string): string
{
	return code.replace(/^( {4})+/gm, (match) => {
		return '  '.repeat(match.length / 4);
	});
}

let oldProgram: import('typescript').Program | undefined;

export async function checkTypes(options: TypeCheckOptions): Promise<TypeCheckResult>
{
	const { packageRoot, compilerOptions = {} } = options;

	const sourceDir = path.join(packageRoot, 'src');
	if (!fs.existsSync(sourceDir))
	{
		return { errors: [] };
	}

	const rootNames = [
		...collectSourceFiles(sourceDir, tsExtensions),
		...collectDeclarationFiles(packageRoot),
	];
	if (rootNames.length === 0)
	{
		return { errors: [] };
	}

	const { default: ts } = await import('typescript');

	const typeCheckCompilerOptions: CompilerOptions = {
		...compilerOptions,
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		allowJs: true,
		checkJs: false,
		strict: true,
		noEmit: true,
		skipLibCheck: true,
		declaration: false,
		declarationMap: false,
	};

	const host = ts.createCompilerHost(typeCheckCompilerOptions, true);
	const program = ts.createProgram(rootNames, typeCheckCompilerOptions, host, oldProgram);
	oldProgram = program;

	const excludePatterns = options.exclude?.map((f) => path.resolve(f)) ?? [];
	const isExcluded = createPathFilter(excludePatterns);

	const sourceFiles = program.getSourceFiles().filter((file) => {
		return file.fileName.startsWith(packageRoot)
			&& !file.fileName.includes('/node_modules/')
			&& !isExcluded(file.fileName);
	});

	const diagnostics: Diagnostic[] = [];
	for (const sourceFile of sourceFiles)
	{
		diagnostics.push(
			...program.getSyntacticDiagnostics(sourceFile),
			...program.getSemanticDiagnostics(sourceFile),
		);
	}

	// TS2304: Cannot find name — expected for global variables from external Bitrix extensions (e.g. BX)
	const ignoredCodes = new Set([2304]);
	const filterFiles = options.files?.map((f) => path.resolve(f));

	const errors = diagnostics.filter((d) => {
		if (d.category !== ts.DiagnosticCategory.Error || ignoredCodes.has(d.code))
		{
			return false;
		}

		if (filterFiles && d.file)
		{
			return filterFiles.some((f) => d.file!.fileName === f);
		}

		return true;
	});

	if (errors.length === 0)
	{
		return { errors: [] };
	}

	return {
		errors: diagnosticsToErrors(ts, errors),
	};
}

export default async function typescriptPlugin(options: TypeScriptPluginOptions): Promise<Plugin>
{
	const { default: ts } = await import('typescript');

	const {
		packageRoot,
		compilerOptions,
		include,
		exclude = [
			`${packageRoot}/dist/**`,
			`${packageRoot}/test/**`,
		],
	} = options;

	const filter = createFilter(include, exclude);

	const transpileCompilerOptions: CompilerOptions = {
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
					compilerOptions: transpileCompilerOptions,
					fileName: id,
				});

				return {
					code: normalizeIndent(result.outputText),
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
				compilerOptions: transpileCompilerOptions,
				fileName: normalizedId,
			});

			return {
				code: normalizeIndent(result.outputText),
				map: result.sourceMapText ? JSON.parse(result.sourceMapText) : undefined,
			};
		},
	};
}

function collectSourceFiles(directory: string, extensions: string[]): string[]
{
	const files: string[] = [];

	for (const entry of fs.readdirSync(directory, { withFileTypes: true }))
	{
		const fullPath = path.join(directory, entry.name);

		if (entry.isDirectory())
		{
			files.push(...collectSourceFiles(fullPath, extensions));
		}
		else if (extensions.some((ext) => entry.name.endsWith(ext)))
		{
			files.push(fullPath);
		}
	}

	return files;
}

function collectDeclarationFiles(directory: string): string[]
{
	const files: string[] = [];

	for (const entry of fs.readdirSync(directory, { withFileTypes: true }))
	{
		if (!entry.isDirectory() && entry.name.endsWith('.d.ts'))
		{
			files.push(path.join(directory, entry.name));
		}
	}

	return files;
}

function diagnosticsToErrors(ts: typeof import('typescript'), diagnostics: Diagnostic[]): BuildDiagnostic[]
{
	return diagnostics.map((diagnostic) => {
		const message = `TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;

		if (!diagnostic.file || diagnostic.start === undefined)
		{
			return { code: CF.TS_TYPE_ERROR, message };
		}

		const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

		return {
			code: CF.TS_TYPE_ERROR,
			message,
			loc: {
				file: diagnostic.file.fileName,
				line: line + 1,
				column: character + 1,
			},
		};
	});
}
