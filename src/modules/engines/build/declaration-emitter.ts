import path from 'node:path';
import fs from 'node:fs';

export interface DeclarationEmitOptions
{
	packageRoot: string;
	namespace: string;
	outputPath: string;
}

export class DeclarationEmitter
{
	async emit(options: DeclarationEmitOptions): Promise<void>
	{
		const { packageRoot, namespace, outputPath } = options;

		if (!namespace || namespace === 'window')
		{
			return;
		}

		const sourceDir = path.join(packageRoot, 'src');
		if (!fs.existsSync(sourceDir))
		{
			return;
		}

		const declarations = await this.#generateDeclarations(packageRoot, sourceDir);
		if (declarations.size === 0)
		{
			return;
		}

		const content = this.#buildAmbientDeclaration(namespace, declarations);
		fs.writeFileSync(outputPath, content, 'utf-8');
	}

	async #generateDeclarations(packageRoot: string, sourceDir: string): Promise<Map<string, string>>
	{
		const { default: ts } = await import('typescript');

		const tsExtensions = ['.ts', '.tsx', '.mts', '.cts'];
		const rootNames = this.#collectSourceFiles(sourceDir, tsExtensions);

		if (rootNames.length === 0)
		{
			return new Map();
		}

		const compilerOptions: import('typescript').CompilerOptions = {
			target: ts.ScriptTarget.ESNext,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			strict: true,
			declaration: true,
			emitDeclarationOnly: true,
			skipLibCheck: true,
			rootDir: packageRoot,
			outDir: path.join(packageRoot, 'dist'),
		};

		const host = ts.createCompilerHost(compilerOptions, true);
		const declarations = new Map<string, string>();

		host.writeFile = (fileName: string, text: string) => {
			if (fileName.endsWith('.d.ts'))
			{
				declarations.set(fileName, text);
			}
		};

		const program = ts.createProgram(rootNames, compilerOptions, host);
		program.emit();

		return declarations;
	}

	#buildAmbientDeclaration(namespace: string, declarations: Map<string, string>): string
	{
		const exportedMembers = this.#extractExportedMembers(declarations);

		if (exportedMembers.length === 0)
		{
			return '';
		}

		const indent = '\t';
		const body = exportedMembers
			.map((member) => member.split('\n').map((line) => line.length > 0 ? `${indent}${line}` : line).join('\n'))
			.join('\n\n');

		return `declare namespace ${namespace} {\n${body}\n}\n`;
	}

	#extractExportedMembers(declarations: Map<string, string>): string[]
	{
		const members: string[] = [];

		for (const content of declarations.values())
		{
			const lines = content.split('\n');
			let i = 0;

			while (i < lines.length)
			{
				const line = lines[i];

				if (this.#isExportedDeclaration(line))
				{
					const jsdoc = this.#extractLeadingJsdoc(lines, i);
					const block = this.#extractDeclarationBlock(lines, i);
					const text = jsdoc ? `${jsdoc}\n${block.text}` : block.text;
					members.push(text);
					i = block.endLine + 1;
				}
				else
				{
					i++;
				}
			}
		}

		return members;
	}

	#extractLeadingJsdoc(lines: string[], declarationLine: number): string | null
	{
		let end = declarationLine - 1;

		// Skip blank lines between JSDoc and declaration
		while (end >= 0 && lines[end].trim() === '')
		{
			end--;
		}

		if (end < 0 || !lines[end].trim().endsWith('*/'))
		{
			return null;
		}

		let start = end;
		while (start > 0 && !lines[start].trim().startsWith('/*'))
		{
			start--;
		}

		if (!lines[start].trim().startsWith('/*'))
		{
			return null;
		}

		return lines.slice(start, end + 1).join('\n');
	}

	#isExportedDeclaration(line: string): boolean
	{
		return /^export\s+(declare\s+)?(class|interface|type|enum|function|const|let|var)\s/.test(line);
	}

	#extractDeclarationBlock(lines: string[], startLine: number): { text: string; endLine: number }
	{
		const firstLine = lines[startLine]
			.replace(/^export\s+declare\s+/, '')
			.replace(/^export\s+/, '');

		// Single-line declaration (e.g., `export type Foo = string;`)
		if (this.#isCompleteLine(lines[startLine]))
		{
			return {
				text: firstLine,
				endLine: startLine,
			};
		}

		// Multi-line declaration — track braces
		const collectedLines = [firstLine];
		let braceDepth = this.#countBraceBalance(lines[startLine]);
		let i = startLine + 1;

		while (i < lines.length)
		{
			if (lines[i].trim() !== '#private;')
			{
				collectedLines.push(lines[i]);
			}

			braceDepth += this.#countBraceBalance(lines[i]);

			if (braceDepth <= 0 && lines[i].trim().length > 0)
			{
				break;
			}

			i++;
		}

		return {
			text: collectedLines.join('\n'),
			endLine: i,
		};
	}

	#isCompleteLine(line: string): boolean
	{
		return line.trimEnd().endsWith(';') && !line.includes('{');
	}

	#countBraceBalance(line: string): number
	{
		let balance = 0;
		for (const char of line)
		{
			if (char === '{') balance++;
			if (char === '}') balance--;
		}

		return balance;
	}

	#collectSourceFiles(directory: string, extensions: string[]): string[]
	{
		const files: string[] = [];

		for (const entry of fs.readdirSync(directory, { withFileTypes: true }))
		{
			const fullPath = path.join(directory, entry.name);

			if (entry.isDirectory())
			{
				files.push(...this.#collectSourceFiles(fullPath, extensions));
			}
			else if (extensions.some((ext) => entry.name.endsWith(ext)))
			{
				files.push(fullPath);
			}
		}

		return files;
	}
}
