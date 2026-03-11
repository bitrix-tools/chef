import path from 'node:path';
import fs from 'node:fs';

import chalk from 'chalk';
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

	const baseCompilerOptions: CompilerOptions = {
		...compilerOptions,
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		allowJs: true,
		checkJs: false,
		strict: true,
		declaration: false,
		declarationMap: false,
		sourceMap: true,
		inlineSources: true,
	};

	const typeCheckCompilerOptions: CompilerOptions = {
		...baseCompilerOptions,
		noEmit: true,
	};

	const transpileCompilerOptions: CompilerOptions = {
		...baseCompilerOptions,
		noEmit: false,
		outDir: path.join(packageRoot, 'dist'),
		rootDir: packageRoot,
	};

	const tsExtensions = ['.ts', '.tsx', '.mts', '.cts'];

	let oldProgram: import('typescript').Program | undefined;

	return {
		name: 'bitrix-typescript',

		buildStart()
		{
			const sourceDir = path.join(packageRoot, 'src');
			if (!fs.existsSync(sourceDir))
			{
				return;
			}

			const rootNames = collectSourceFiles(sourceDir, tsExtensions);
			if (rootNames.length === 0)
			{
				return;
			}

			const host = ts.createCompilerHost(typeCheckCompilerOptions, true);
			const program = ts.createProgram(rootNames, typeCheckCompilerOptions, host, oldProgram);
			oldProgram = program;

			const sourceFiles = program.getSourceFiles().filter((file) => {
				return file.fileName.startsWith(packageRoot) && !file.fileName.includes('/node_modules/');
			});

			const diagnostics: Diagnostic[] = [];
			for (const sourceFile of sourceFiles)
			{
				diagnostics.push(
					...program.getSyntacticDiagnostics(sourceFile),
					...program.getSemanticDiagnostics(sourceFile),
				);
			}

			const errors = diagnostics.filter(
				(d) => d.category === ts.DiagnosticCategory.Error,
			);

			if (errors.length === 0)
			{
				return;
			}

			const formatted = formatDiagnostics(ts, errors, packageRoot);
			this.error(formatted);
		},

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
				compilerOptions: transpileCompilerOptions,
				fileName: normalizedId,
			});

			return {
				code: result.outputText,
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

const CONTEXT_LINES = 2;

function formatDiagnostics(ts: typeof import('typescript'), diagnostics: Diagnostic[], packageRoot: string): string
{
	const lines: string[] = [];

	for (let index = 0; index < diagnostics.length; index++)
	{
		const diagnostic = diagnostics[index];
		const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
		const code = chalk.gray(`TS${diagnostic.code}`);

		if (!diagnostic.file || diagnostic.start === undefined)
		{
			lines.push(`${chalk.red('×')} ${code} ${message}`);
			continue;
		}

		const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
		const lineNumber = line + 1;
		const column = character + 1;
		const fileLink = `${diagnostic.file.fileName}:${lineNumber}:${column}`;

		lines.push(`${chalk.red('×')} ${code} ${message}`);
		lines.push('');

		const codeFrame = renderDiagnosticCodeFrame(diagnostic, line, character);
		for (const frameLine of codeFrame)
		{
			lines.push(frameLine);
		}

		lines.push('');
		lines.push(`at ${chalk.cyan(fileLink)}`);

		if (index < diagnostics.length - 1)
		{
			lines.push('');
			lines.push(chalk.gray('─'.repeat(40)));
			lines.push('');
		}
	}

	return lines.join('\n');
}

function renderDiagnosticCodeFrame(diagnostic: Diagnostic, line: number, character: number): string[]
{
	if (!diagnostic.file)
	{
		return [];
	}

	const sourceText = diagnostic.file.getFullText();
	const sourceLines = sourceText.split('\n');
	const startLine = Math.max(0, line - CONTEXT_LINES);
	const endLine = Math.min(sourceLines.length - 1, line + CONTEXT_LINES);
	const padWidth = String(endLine + 1).length;
	const tabSize = 4;
	const expandTabs = (str: string) => str.replace(/\t/g, ' '.repeat(tabSize));

	// Find minimum common indent to strip
	const expandedLines: string[] = [];
	for (let i = startLine; i <= endLine; i++)
	{
		expandedLines.push(expandTabs(sourceLines[i]));
	}

	const minIndent = expandedLines.reduce((min, expanded) => {
		if (expanded.trim().length === 0)
		{
			return min;
		}

		const indent = expanded.match(/^(\s*)/)?.[1].length ?? 0;

		return Math.min(min, indent);
	}, Infinity);

	const strip = minIndent === Infinity ? 0 : minIndent;

	const result: string[] = [];

	for (let i = startLine; i <= endLine; i++)
	{
		const lineNum = String(i + 1).padStart(padWidth);
		const sourceLine = expandedLines[i - startLine].slice(strip);

		if (i === line)
		{
			result.push(`${chalk.red('>')} ${chalk.dim(lineNum)} ${chalk.gray('|')} ${sourceLine}`);

			if (diagnostic.length)
			{
				const before = sourceLines[i].substring(0, character);
				const expandedOffset = expandTabs(before).length - strip;
				const pointer = ' '.repeat(Math.max(0, expandedOffset)) + '^'.repeat(diagnostic.length);
				result.push(`  ${' '.repeat(padWidth)} ${chalk.gray('|')} ${chalk.red(pointer)}`);
			}
		}
		else
		{
			result.push(`  ${chalk.dim(lineNum)} ${chalk.gray('|')} ${chalk.gray(sourceLine)}`);
		}
	}

	return result;
}
