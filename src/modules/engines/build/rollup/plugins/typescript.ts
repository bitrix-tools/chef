import path from 'node:path';
import fs from 'node:fs';

import { createFilter } from '@rollup/pluginutils';

import type { Plugin } from 'rollup';
import type { CompilerOptions, Diagnostic } from 'typescript/unstable/sync';
import type { BuildDiagnostic } from '../../build-types';

import { CF } from '../../../../../diagnostics/diagnostic-codes';
import { createPathFilter } from '../../../../../utils/create-path-filter';
import { normalizePath } from '../../../../../utils/path/normalize';
import { flattenDiagnosticText, getTypeScriptApi } from '../../../../../utils/typescript-api';

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
	ignoreCodes?: number[];
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
function isDirectory(filePath: string): boolean
{
	try
	{
		return fs.statSync(filePath).isDirectory();
	}
	catch
	{
		return false;
	}
}

function normalizeIndent(code: string): string
{
	return code.replace(/^( {4})+/gm, (match) => {
		return '  '.repeat(match.length / 4);
	});
}

export async function checkTypes(options: TypeCheckOptions): Promise<TypeCheckResult>
{
	const { packageRoot, compilerOptions = {} } = options;

	const sourceDir = path.join(packageRoot, 'src');
	if (!fs.existsSync(sourceDir))
	{
		return { errors: [] };
	}

	// The bundle's own .d.ts sits next to the output .js in the package root, so
	// collectDeclarationFiles would feed the previous build's output back into the
	// program. For a namespaced package that declaration says `declare namespace BX.Main`,
	// which turns BX from an unknown global (TS2304, deliberately ignored below) into a
	// known type with a single member — and every other BX.* use in untouched sources
	// starts failing with TS2339. Each successful build would then break the next one.
	const emittedDeclarations = collectEmittedDeclarationPaths(options.exclude);
	const rootNames = [
		...collectSourceFiles(sourceDir, tsExtensions),
		...collectDeclarationFiles(packageRoot).filter((filePath) => {
			return !emittedDeclarations.has(normalizePath(filePath));
		}),
	];
	if (rootNames.length === 0)
	{
		return { errors: [] };
	}

	const api = await getTypeScriptApi();
	const { DiagnosticCategory, ModuleKind, ModuleResolutionKind } = await import('typescript/unstable/sync');
	const { ScriptTarget } = await import('typescript/unstable/ast');

	const typeCheckCompilerOptions: CompilerOptions = {
		// TS 6+ reports side-effect imports it cannot resolve (TS2882). Bitrix extensions import
		// CSS-only extensions this way (`import 'ui.forms'`) and leave them to the bundler.
		noUncheckedSideEffectImports: false,
		...compilerOptions,
		target: ScriptTarget.ESNext,
		module: ModuleKind.ESNext,
		moduleResolution: ModuleResolutionKind.Bundler,
		allowJs: true,
		checkJs: false,
		strict: true,
		noEmit: true,
		skipLibCheck: true,
		declaration: false,
		declarationMap: false,
	};

	const excludePatterns = options.exclude?.map((f) => path.resolve(f)) ?? [];
	const isExcluded = createPathFilter(excludePatterns);
	const packageRootPosix = normalizePath(packageRoot);

	const program = api.createProgram(rootNames, typeCheckCompilerOptions);
	const diagnostics: Diagnostic[] = [];

	try
	{
		const sourceFiles = program.getSourceFileNames().filter((fileName) => {
			const fileNamePosix = normalizePath(fileName);
			return fileNamePosix.startsWith(packageRootPosix)
				&& !fileNamePosix.includes('/node_modules/')
				&& !isExcluded(fileName);
		});

		// Only the extension's own files are asked for diagnostics. Dependencies written in Flow
		// are parsed as `.js` and produce syntax errors that must not leak into the result.
		for (const sourceFile of sourceFiles)
		{
			diagnostics.push(
				...program.getSyntacticDiagnostics(sourceFile),
				...program.getSemanticDiagnostics(sourceFile),
			);
		}
	}
	finally
	{
		program.dispose();
	}

	// TS2304: Cannot find name — expected for global variables from external Bitrix extensions (e.g. BX)
	const ignoredCodes = new Set([2304, ...(options.ignoreCodes ?? [])]);
	const filterFiles = options.files?.map((f) => normalizePath(path.resolve(f)));

	const errors = diagnostics.filter((d) => {
		if (d.category !== DiagnosticCategory.Error || ignoredCodes.has(d.code) || isUntypedBitrixGlobal(d))
		{
			return false;
		}

		if (filterFiles && d.fileName)
		{
			const fileNamePosix = normalizePath(d.fileName);
			return filterFiles.some((f) => fileNamePosix === f);
		}

		return true;
	});

	if (errors.length === 0)
	{
		return { errors: [] };
	}

	return {
		errors: diagnosticsToErrors(errors),
	};
}

export default async function typescriptPlugin(options: TypeScriptPluginOptions): Promise<Plugin>
{
	const api = await getTypeScriptApi();
	const { ModuleKind, ModuleResolutionKind } = await import('typescript/unstable/sync');
	const { ScriptTarget } = await import('typescript/unstable/ast');

	const {
		packageRoot,
		compilerOptions,
		include,
		exclude = [
			`${normalizePath(packageRoot)}/dist/**`,
			`${normalizePath(packageRoot)}/test/**`,
		],
	} = options;

	const filter = createFilter(include, exclude);

	// Every transpile call sends its options to the compiler process. `paths` and `types` do not
	// affect a single-file transpile, and `paths` holds every alias of the project (thousands of
	// entries in a large repository), so they are left out.
	const { paths, types, ...transpileBaseOptions } = compilerOptions;
	const transpileCompilerOptions: CompilerOptions = {
		...transpileBaseOptions,
		target: ScriptTarget.ESNext,
		module: ModuleKind.ESNext,
		moduleResolution: ModuleResolutionKind.Bundler,
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
			if (!importer)
			{
				return null;
			}

			// Bare specifiers (`main.core`, `react`) are handled elsewhere (npm-remap, node-resolve,
			// external dependency markers). We only deal with relative paths here.
			if (!source.startsWith('.'))
			{
				return null;
			}

			const importerDir = path.dirname(importer);
			const resolved = path.resolve(importerDir, source);
			const hasTrailingSlash = source.endsWith('/') || source.endsWith('\\');

			// Already a fully qualified file path with extension — let other plugins handle it
			// (e.g. resolving `.js` → `.ts` is a separate concern we don't implement yet).
			if (!hasTrailingSlash && path.extname(source))
			{
				return null;
			}

			// 1) ./lib   → ./lib.ts | ./lib.tsx | ./lib.mts | ./lib.cts
			if (!hasTrailingSlash)
			{
				for (const ext of tsExtensions)
				{
					const candidate = resolved + ext;
					if (fs.existsSync(candidate))
					{
						return candidate;
					}
				}
			}

			// 2) ./lib   → ./lib/index.ts | …   (only if `./lib` is an actual directory)
			//    ./lib/  → ./lib/index.ts | …   (trailing slash forces directory lookup)
			if (hasTrailingSlash || isDirectory(resolved))
			{
				for (const ext of tsExtensions)
				{
					const candidate = path.join(resolved, `index${ext}`);
					if (fs.existsSync(candidate))
					{
						return candidate;
					}
				}
			}

			return null;
		},

		transform(code, id)
		{
			if (/\.vue\?.*&lang\.ts/.test(id))
			{
				const result = api.transpileModule(code, {
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

			if (!/\.[cm]?tsx?$/.test(normalizedId) || /\.d\.[cm]?ts$/.test(normalizedId))
			{
				return null;
			}

			const result = api.transpileModule(code, {
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

/**
 * The declaration a build emits for its own bundle, derived from the output paths the
 * caller already excludes from diagnostics. DeclarationEmitter writes it by swapping the
 * output .js extension for .d.ts, so mirror that rule here.
 */
function collectEmittedDeclarationPaths(exclude?: string[]): Set<string>
{
	const paths = new Set<string>();

	for (const filePath of exclude ?? [])
	{
		if (filePath.endsWith('.js'))
		{
			paths.add(normalizePath(path.resolve(filePath.replace(/\.js$/, '.d.ts'))));
		}
	}

	return paths;
}

const declarationSkipDirs = new Set(['src', 'dist', 'node_modules', 'test']);

function collectDeclarationFiles(directory: string): string[]
{
	const files: string[] = [];

	for (const entry of fs.readdirSync(directory, { withFileTypes: true }))
	{
		const fullPath = path.join(directory, entry.name);

		if (entry.isDirectory())
		{
			if (!declarationSkipDirs.has(entry.name))
			{
				files.push(...collectDeclarationFiles(fullPath));
			}
		}
		else if (entry.name.endsWith('.d.ts'))
		{
			files.push(fullPath);
		}
	}

	return files;
}

/**
 * The TS2304 case for BX in another form: when some declaration adds types under
 * `declare global { namespace BX }`, BX becomes a type-only namespace, and using it as a value
 * reports TS2708 instead of TS2304.
 */
function isUntypedBitrixGlobal(diagnostic: Diagnostic): boolean
{
	return diagnostic.code === 2708 && diagnostic.text.includes('\'BX\'');
}

function diagnosticsToErrors(diagnostics: Diagnostic[]): BuildDiagnostic[]
{
	return diagnostics.map((diagnostic) => {
		const message = `TS${diagnostic.code} ${flattenDiagnosticText(diagnostic)}`;

		if (!diagnostic.fileName || !diagnostic.startPosition)
		{
			return { code: CF.TS_TYPE_ERROR, message };
		}

		const { line, character } = diagnostic.startPosition;

		return {
			code: CF.TS_TYPE_ERROR,
			message,
			loc: {
				file: diagnostic.fileName,
				line: line + 1,
				column: character + 1,
			},
		};
	});
}
