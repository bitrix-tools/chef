import path from 'node:path';
import fs from 'node:fs';

export interface DeclarationEmitOptions
{
	packageRoot: string;
	input: string;
	namespace: string;
	outputPath: string;
}

export class DeclarationEmitter
{
	async emit(options: DeclarationEmitOptions): Promise<void>
	{
		const { packageRoot, input, namespace, outputPath } = options;

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

		const entryDtsPath = this.#findEntryDeclaration(input, packageRoot, declarations);
		if (!entryDtsPath)
		{
			return;
		}

		const content = this.#buildAmbientDeclaration(namespace, entryDtsPath, declarations);
		if (content)
		{
			fs.writeFileSync(outputPath, content, 'utf-8');
		}
	}

	#findEntryDeclaration(input: string, packageRoot: string, declarations: Map<string, string>): string | null
	{
		const outDir = path.join(packageRoot, 'dist');
		const relative = path.relative(packageRoot, input).replace(/\.tsx?$/, '.d.ts');
		const expected = path.join(outDir, relative);

		if (declarations.has(expected))
		{
			return expected;
		}

		// Fallback: find by filename
		const inputBasename = path.basename(input).replace(/\.tsx?$/, '.d.ts');
		for (const key of declarations.keys())
		{
			if (key.endsWith(`/${inputBasename}`) || key.endsWith(`\\${inputBasename}`))
			{
				return key;
			}
		}

		return null;
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
				declarations.set(fileName, this.#convertIndentation(text));
			}
		};

		const program = ts.createProgram(rootNames, compilerOptions, host);
		program.emit();

		return declarations;
	}

	#buildAmbientDeclaration(namespace: string, entryPath: string, declarations: Map<string, string>): string
	{
		const members = this.#collectEntryExports(entryPath, declarations);

		if (members.length === 0)
		{
			return '';
		}

		this.#resolveUnknownTypes(members, declarations);

		const topLevelTypes: string[] = [];
		const namespaceMembers: string[] = [];

		for (const member of members)
		{
			if (/^(type|interface)\s/.test(member))
			{
				topLevelTypes.push(member);
			}
			else
			{
				namespaceMembers.push(member);
			}
		}

		// Collect names defined inside namespace
		const namespaceMemberNames = new Set<string>();
		for (const member of namespaceMembers)
		{
			const match = member.match(/^(?:class|function|const|let|var|enum)\s+(\w+)/m);
			if (match)
			{
				namespaceMemberNames.add(match[1]);
			}
		}

		// In top-level types, qualify references to namespace members
		if (namespaceMemberNames.size > 0)
		{
			for (let i = 0; i < topLevelTypes.length; i++)
			{
				for (const memberName of namespaceMemberNames)
				{
					topLevelTypes[i] = topLevelTypes[i].replace(
						new RegExp(`\\b${memberName}\\b`, 'g'),
						`${namespace}.${memberName}`,
					);
				}
			}
		}

		const parts: string[] = [];

		if (topLevelTypes.length > 0)
		{
			parts.push(topLevelTypes.join('\n\n'));
		}

		if (namespaceMembers.length > 0)
		{
			const indent = '\t';
			const body = namespaceMembers
				.map((member) => member.split('\n').map((line) => line.length > 0 ? `${indent}${line}` : line).join('\n'))
				.join('\n\n');

			parts.push(`declare namespace ${namespace} {\n${body}\n}`);
		}

		return '/* eslint-disable */\n' + parts.join('\n\n') + '\n';
	}

	#resolveUnknownTypes(members: string[], declarations: Map<string, string>): void
	{
		const maxPasses = 10;

		for (let pass = 0; pass < maxPasses; pass++)
		{
			const definedNames = this.#collectDefinedNames(members);
			const fullText = members.join('\n');
			const unknownNames = this.#findUnknownTypeReferences(fullText, definedNames);

			if (unknownNames.length === 0)
			{
				break;
			}

			let added = false;
			for (const name of unknownNames)
			{
				const declaration = this.#findDeclarationInAllFiles(name, declarations, fullText);
				if (declaration)
				{
					definedNames.add(name);
					members.push(declaration);
					added = true;
				}
			}

			if (!added)
			{
				break;
			}
		}
	}

	#collectDefinedNames(members: string[]): Set<string>
	{
		const names = new Set<string>();

		for (const member of members)
		{
			const lines = member.split('\n');
			for (const line of lines)
			{
				const match = line.match(
					/^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:class|interface|type|enum|function|const|let|var)\s+(\w+)/,
				);

				if (match)
				{
					names.add(match[1]);
				}
			}
		}

		return names;
	}

	#findUnknownTypeReferences(text: string, definedNames: Set<string>): string[]
	{
		const builtinTypes = new Set([
			'string', 'number', 'boolean', 'void', 'null', 'undefined', 'never', 'any', 'unknown', 'object', 'symbol', 'bigint',
			'true', 'false', 'this',
			'Array', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Record', 'Function', 'Partial', 'Required',
			'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable', 'ReturnType', 'InstanceType',
			'Parameters', 'ConstructorParameters', 'Awaited', 'WeakKey', 'ArrayIterator', 'Iterable', 'Iterator',
			'HTMLElement', 'HTMLBodyElement', 'Element', 'Node', 'Text', 'Event', 'EventTarget',
			'EventListenerOrEventListenerObject', 'Document', 'DOMRect', 'Window', 'FormData', 'Blob', 'File',
			'ArrayBuffer', 'ArrayLike', 'Date', 'RegExp',
			'T', 'K', 'V', 'U', 'DataType',
		]);

		const candidates = new Set<string>();

		// Match identifiers used in type positions (PascalCase names)
		const typePattern = /\b([A-Z]\w+)\b/g;
		let match;

		while ((match = typePattern.exec(text)) !== null)
		{
			const name = match[1];
			if (!definedNames.has(name) && !builtinTypes.has(name))
			{
				candidates.add(name);
			}
		}

		// Match computed property names like [isError]: boolean
		const computedPropPattern = /\[(\w+)\]\s*:/g;

		while ((match = computedPropPattern.exec(text)) !== null)
		{
			const name = match[1];
			if (!definedNames.has(name))
			{
				candidates.add(name);
			}
		}

		return [...candidates];
	}

	#findDeclarationInAllFiles(name: string, declarations: Map<string, string>, contextText?: string): string | null
	{
		for (const [filePath, content] of declarations)
		{
			const lines = content.split('\n');

			for (let i = 0; i < lines.length; i++)
			{
				const line = lines[i];

				// declare const name: unique symbol; — strip `declare` since it will be inside ambient namespace
				if (line.match(new RegExp(`^declare\\s+const\\s+${name}\\s*:`)))
				{
					const block = this.#extractDeclareConstBlock(lines, i);

					return block.replace(/^declare\s+/, '');
				}

				// Exported or non-exported declaration (including `export default class Foo`)
				const declPattern = new RegExp(
					`^(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:class|interface|type|enum|function|const|let|var)\\s+${name}\\b`,
				);

				if (declPattern.test(line))
				{
					const jsdoc = this.#extractLeadingJsdoc(lines, i);
					const block = this.#extractDeclarationBlock(lines, i);
					const text = jsdoc ? `${jsdoc}\n${block.text}` : block.text;

					return text;
				}
			}

			// Check if name is used as a default import alias:
			// `import Name from './module'` where module has `export default BuiltinType`
			for (const line of lines)
			{
				const importMatch = line.match(new RegExp(`^import\\s+${name}\\s+from\\s+['"](.+)['"]\\s*;?\\s*$`));
				if (importMatch)
				{
					const resolvedPath = this.#resolveSpecifier(filePath, importMatch[1], declarations);
					if (resolvedPath)
					{
						const sourceContent = declarations.get(resolvedPath);
						if (sourceContent)
						{
							const defaultReExport = sourceContent.match(/^export\s+default\s+(\w+)\s*;?\s*$/m);
							if (defaultReExport)
							{
								const target = defaultReExport[1];
								const generics = contextText ? this.#inferGenericParams(name, contextText) : null;

								if (generics)
								{
									return `type ${name}${generics.params} = ${target}${generics.args};`;
								}

								return `type ${name} = ${target};`;
							}
						}
					}
				}
			}
		}

		return null;
	}

	#inferGenericParams(name: string, contextText: string): { params: string; args: string } | null
	{
		// Find usage like `Name<X, Y>` in context and extract generic arguments
		const usagePattern = new RegExp(`\\b${name}<([^>]+)>`);
		const match = contextText.match(usagePattern);
		if (!match)
		{
			return null;
		}

		const args = match[1].split(',').map((a) => a.trim());
		const paramNames: string[] = [];
		const seen = new Set<string>();

		for (const arg of args)
		{
			// Extract the base type name (e.g., "string" -> "string", "T" -> "T")
			const baseName = arg.replace(/\[\]$/, '').trim();

			if (/^[A-Z]$/.test(baseName) && !seen.has(baseName))
			{
				paramNames.push(baseName);
				seen.add(baseName);
			}
			else
			{
				// Generate a parameter name for concrete types
				const paramName = String.fromCharCode(75 + paramNames.length); // K, L, M...
				paramNames.push(paramName);
			}
		}

		return {
			params: `<${paramNames.join(', ')}>`,
			args: `<${paramNames.join(', ')}>`,
		};
	}

	#extractDeclareConstBlock(lines: string[], startLine: number): string
	{
		const firstLine = lines[startLine];

		if (this.#isCompleteLine(firstLine))
		{
			return firstLine;
		}

		const collectedLines = [firstLine];
		let braceDepth = this.#countBraceBalance(firstLine);
		let i = startLine + 1;

		while (i < lines.length)
		{
			collectedLines.push(lines[i]);
			braceDepth += this.#countBraceBalance(lines[i]);

			if (braceDepth <= 0 && lines[i].trim().length > 0)
			{
				break;
			}

			i++;
		}

		return collectedLines.join('\n');
	}

	#collectEntryExports(entryPath: string, declarations: Map<string, string>): string[]
	{
		const content = declarations.get(entryPath);
		if (!content)
		{
			return [];
		}

		const lines = content.split('\n');
		const members: string[] = [];
		const seen = new Set<string>();
		const imports = this.#parseImports(lines, entryPath, declarations, members, seen);

		for (let i = 0; i < lines.length; i++)
		{
			const line = lines[i];

			// export { Foo, Bar, ... } or export { Foo, Bar, ... };
			const namedExportMatch = line.match(/^export\s*\{([^}]+)\}\s*;?\s*$/);
			if (namedExportMatch)
			{
				const exportNames = namedExportMatch[1].split(',').map((n) => {
					const parts = n.trim().split(/\s+as\s+/);

					return { original: parts[0].trim(), alias: (parts[1] || parts[0]).trim() };
				}).filter((n) => n.original);

				for (const { original, alias } of exportNames)
				{
					if (seen.has(alias))
					{
						continue;
					}

					const declaration = imports.get(original);
					if (declaration)
					{
						seen.add(alias);

						if (original !== alias)
						{
							members.push(this.#renameDeclaration(declaration, original, alias));
						}
						else
						{
							members.push(declaration);
						}
					}
				}

				continue;
			}

			// export * from './module' or export type * from './module'
			const starReExport = line.match(/^export\s+(?:type\s+)?\*\s+from\s+['"](.+)['"]\s*;?\s*$/);
			if (starReExport)
			{
				const resolvedPath = this.#resolveSpecifier(entryPath, starReExport[1], declarations);
				if (resolvedPath)
				{
					this.#extractAllExports(resolvedPath, declarations, members, seen);
				}

				continue;
			}

			// export { Foo, Bar } from './module' or export { default as Foo } from './module'
			const namedReExport = line.match(/^export\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"](.+)['"]\s*;?\s*$/);
			if (namedReExport)
			{
				const reExportNames = namedReExport[1].split(',').map((n) => {
					const parts = n.trim().split(/\s+as\s+/);

					return { original: parts[0].trim(), alias: (parts[1] || parts[0]).trim() };
				}).filter((n) => n.original);

				const resolvedPath = this.#resolveSpecifier(entryPath, namedReExport[2], declarations);
				if (resolvedPath)
				{
					this.#extractNamedReExports(resolvedPath, declarations, reExportNames, members, seen);
				}

				continue;
			}

			// Direct export declaration in entry point
			if (this.#isExportedDeclaration(line))
			{
				const jsdoc = this.#extractLeadingJsdoc(lines, i);
				const block = this.#extractDeclarationBlock(lines, i);
				const name = this.#extractDeclarationName(line);
				const isOverload = seen.has(name!) && /^export\s+(?:declare\s+)?function\s/.test(line);

				if (!name || !seen.has(name) || isOverload)
				{
					if (name)
					{
						seen.add(name);
					}

					const text = jsdoc ? `${jsdoc}\n${block.text}` : block.text;
					members.push(text);
				}

				i = block.endLine;
			}
		}

		return members;
	}

	#parseImports(
		lines: string[],
		filePath: string,
		declarations: Map<string, string>,
		dependencyMembers: string[],
		dependencySeen: Set<string>,
	): Map<string, string>
	{
		const imports = new Map<string, string>();

		for (const line of lines)
		{
			// import Foo from './lib/foo'
			const defaultImport = line.match(/^import\s+(\w+)\s+from\s+['"](.+)['"]\s*;?\s*$/);
			if (defaultImport)
			{
				const [, name, specifier] = defaultImport;
				const resolvedPath = this.#resolveSpecifier(filePath, specifier, declarations);
				if (resolvedPath)
				{
					const declaration = this.#extractDefaultExport(resolvedPath, declarations, name, dependencyMembers, dependencySeen);
					if (declaration)
					{
						imports.set(name, declaration);
					}
				}

				continue;
			}

			// import { Foo, Bar } from './lib/module'
			const namedImport = line.match(/^import\s+\{([^}]+)\}\s+from\s+['"](.+)['"]\s*;?\s*$/);
			if (namedImport)
			{
				const names = namedImport[1].split(',').map((n) => {
					const parts = n.trim().split(/\s+as\s+/);

					return { original: parts[0].trim(), alias: (parts[1] || parts[0]).trim() };
				});
				const resolvedPath = this.#resolveSpecifier(filePath, namedImport[2], declarations);
				if (resolvedPath)
				{
					for (const { original, alias } of names)
					{
						const declaration = this.#extractNamedExport(resolvedPath, declarations, original);
						if (declaration)
						{
							if (original !== alias)
							{
								imports.set(alias, this.#renameDeclaration(declaration, original, alias));
							}
							else
							{
								imports.set(alias, declaration);
							}
						}
					}
				}
			}
		}

		return imports;
	}

	#extractDefaultExport(
		filePath: string,
		declarations: Map<string, string>,
		aliasName: string,
		dependencyMembers?: string[],
		dependencySeen?: Set<string>,
		visitedFiles?: Set<string>,
	): string | null
	{
		const content = declarations.get(filePath);
		if (!content)
		{
			return null;
		}

		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++)
		{
			const line = lines[i];

			// export default class Foo / export default interface Foo / etc.
			const defaultDeclMatch = line.match(/^export\s+default\s+(?:abstract\s+)?(?:class|interface|function|enum)\s+(\w+)/);
			if (defaultDeclMatch)
			{
				const [, originalName] = defaultDeclMatch;
				const jsdoc = this.#extractLeadingJsdoc(lines, i);
				const cleaned = line.replace(/^export\s+default\s+/, 'export ');
				const tempLines = [...lines];
				tempLines[i] = cleaned;
				const block = this.#extractDeclarationBlock(tempLines, i);
				let text = block.text;

				if (originalName !== aliasName)
				{
					text = text.replace(originalName, aliasName);
				}

				if (dependencyMembers && dependencySeen)
				{
					this.#collectDependencyTypes(filePath, lines, block.text, declarations, dependencyMembers, dependencySeen, visitedFiles);
				}

				return jsdoc ? `${jsdoc}\n${text}` : text;
			}

			// export default <identifier> — find the matching declare const
			const defaultIdentMatch = line.match(/^export\s+default\s+(\w+)\s*;?\s*$/);
			if (defaultIdentMatch)
			{
				const identName = defaultIdentMatch[1];
				const constDecl = this.#findDeclareConst(lines, identName);
				if (constDecl)
				{
					return constDecl.replace(identName, aliasName);
				}
			}
		}

		return null;
	}

	#collectDependencyTypes(
		filePath: string,
		lines: string[],
		declarationText: string,
		declarations: Map<string, string>,
		members: string[],
		seen: Set<string>,
		visitedFiles?: Set<string>,
	): void
	{
		const visited = visitedFiles || new Set<string>();
		if (visited.has(filePath))
		{
			return;
		}

		visited.add(filePath);

		for (const line of lines)
		{
			// import Foo from './module' or import type Foo from './module'
			const defaultImport = line.match(/^import\s+(?:type\s+)?(\w+)\s+from\s+['"](.+)['"]\s*;?\s*$/);
			if (defaultImport)
			{
				const [, name, specifier] = defaultImport;
				if (seen.has(name) || !this.#isReferencedInDeclaration(name, declarationText))
				{
					continue;
				}

				const resolvedPath = this.#resolveSpecifier(filePath, specifier, declarations);
				if (resolvedPath && !visited.has(resolvedPath))
				{
					const declaration = this.#extractDefaultExport(resolvedPath, declarations, name, members, seen, visited);
					if (declaration)
					{
						seen.add(name);
						members.push(declaration);
					}
				}

				continue;
			}

			// import { Foo, Bar } from './module' or import type { Foo } from './module'
			const namedImport = line.match(/^import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"](.+)['"]\s*;?\s*$/);
			if (namedImport)
			{
				const names = namedImport[1].split(',').map((n) => {
					const parts = n.trim().split(/\s+as\s+/);

					return { original: parts[0].trim(), alias: (parts[1] || parts[0]).trim() };
				});
				const resolvedPath = this.#resolveSpecifier(filePath, namedImport[2], declarations);
				if (resolvedPath)
				{
					for (const { original, alias } of names)
					{
						if (seen.has(alias) || !this.#isReferencedInDeclaration(alias, declarationText))
						{
							continue;
						}

						const declaration = this.#extractNamedExport(resolvedPath, declarations, original);
						if (declaration)
						{
							seen.add(alias);
							members.push(declaration);
						}
					}
				}
			}
		}
	}

	#isReferencedInDeclaration(name: string, declarationText: string): boolean
	{
		const pattern = new RegExp(`\\b${name}\\b`);

		return pattern.test(declarationText);
	}

	#findDeclareConst(lines: string[], name: string): string | null
	{
		for (let i = 0; i < lines.length; i++)
		{
			const line = lines[i];

			if (line.startsWith(`declare const ${name}:`) || line.startsWith(`declare const ${name} `))
			{
				if (this.#isCompleteLine(line))
				{
					return line.replace(/^declare\s+/, '');
				}

				const collectedLines = [line.replace(/^declare\s+/, '')];
				let braceDepth = this.#countBraceBalance(line);
				let j = i + 1;

				while (j < lines.length)
				{
					collectedLines.push(lines[j]);
					braceDepth += this.#countBraceBalance(lines[j]);

					if (braceDepth <= 0 && lines[j].trim().length > 0)
					{
						break;
					}

					j++;
				}

				return collectedLines.join('\n');
			}
		}

		return null;
	}

	#extractNamedExport(filePath: string, declarations: Map<string, string>, name: string): string | null
	{
		const content = declarations.get(filePath);
		if (!content)
		{
			return null;
		}

		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++)
		{
			const line = lines[i];

			if (this.#isExportedDeclaration(line))
			{
				const declName = this.#extractDeclarationName(line);
				if (declName === name)
				{
					const jsdoc = this.#extractLeadingJsdoc(lines, i);
					const block = this.#extractDeclarationBlock(lines, i);
					const text = jsdoc ? `${jsdoc}\n${block.text}` : block.text;

					return text;
				}
			}
		}

		return null;
	}

	#extractNamedExports(
		filePath: string,
		declarations: Map<string, string>,
		names: string[],
		members: string[],
		seen: Set<string>,
	): void
	{
		for (const name of names)
		{
			if (seen.has(name))
			{
				continue;
			}

			const declaration = this.#extractNamedExport(filePath, declarations, name);
			if (declaration)
			{
				seen.add(name);
				members.push(declaration);
			}
		}
	}

	#extractNamedReExports(
		filePath: string,
		declarations: Map<string, string>,
		names: { original: string; alias: string }[],
		members: string[],
		seen: Set<string>,
	): void
	{
		for (const { original, alias } of names)
		{
			if (seen.has(alias))
			{
				continue;
			}

			if (original === 'default')
			{
				const declaration = this.#extractDefaultExport(filePath, declarations, alias, members, seen);
				if (declaration)
				{
					seen.add(alias);
					members.push(declaration);
				}
			}
			else
			{
				const declaration = this.#extractNamedExport(filePath, declarations, original);
				if (declaration)
				{
					seen.add(alias);

					if (original !== alias)
					{
						members.push(this.#renameDeclaration(declaration, original, alias));
					}
					else
					{
						members.push(declaration);
					}
				}
			}
		}
	}

	#renameDeclaration(declaration: string, oldName: string, newName: string): string
	{
		return declaration.replace(
			new RegExp(`\\b${oldName}\\b`),
			newName,
		);
	}

	#extractAllExports(
		filePath: string,
		declarations: Map<string, string>,
		members: string[],
		seen: Set<string>,
	): void
	{
		const content = declarations.get(filePath);
		if (!content)
		{
			return;
		}

		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++)
		{
			const line = lines[i];

			// Nested re-exports: export * from './module'
			const starReExport = line.match(/^export\s+(?:type\s+)?\*\s+from\s+['"](.+)['"]\s*;?\s*$/);
			if (starReExport)
			{
				const resolvedPath = this.#resolveSpecifier(filePath, starReExport[1], declarations);
				if (resolvedPath)
				{
					this.#extractAllExports(resolvedPath, declarations, members, seen);
				}

				continue;
			}

			// Named re-exports: export { Foo, default as Bar } from './module'
			const namedReExport = line.match(/^export\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"](.+)['"]\s*;?\s*$/);
			if (namedReExport)
			{
				const reExportNames = namedReExport[1].split(',').map((n) => {
					const parts = n.trim().split(/\s+as\s+/);

					return { original: parts[0].trim(), alias: (parts[1] || parts[0]).trim() };
				}).filter((n) => n.original);

				const resolvedPath = this.#resolveSpecifier(filePath, namedReExport[2], declarations);
				if (resolvedPath)
				{
					this.#extractNamedReExports(resolvedPath, declarations, reExportNames, members, seen);
				}

				continue;
			}

			if (this.#isExportedDeclaration(line))
			{
				const name = this.#extractDeclarationName(line);
				if (name && seen.has(name))
				{
					const block = this.#extractDeclarationBlock(lines, i);
					i = block.endLine;
					continue;
				}

				const jsdoc = this.#extractLeadingJsdoc(lines, i);
				const block = this.#extractDeclarationBlock(lines, i);

				if (name)
				{
					seen.add(name);
				}

				const text = jsdoc ? `${jsdoc}\n${block.text}` : block.text;
				members.push(text);
				i = block.endLine;
			}
		}
	}

	#resolveSpecifier(fromFile: string, specifier: string, declarations: Map<string, string>): string | null
	{
		const dir = path.dirname(fromFile);
		const resolved = path.resolve(dir, specifier);

		for (const candidate of [resolved + '.d.ts', resolved + '/index.d.ts'])
		{
			if (declarations.has(candidate))
			{
				return candidate;
			}
		}

		return null;
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
		return /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|enum|function|const|let|var)\s/.test(line);
	}

	#extractDeclarationName(line: string): string | null
	{
		const match = line.match(/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|enum|function|const|let|var)\s+(\w+)/);

		return match ? match[1] : null;
	}

	#extractDeclarationBlock(lines: string[], startLine: number): { text: string; endLine: number }
	{
		const firstLine = lines[startLine]
			.replace(/^export\s+declare\s+/, '')
			.replace(/^export\s+default\s+/, '')
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

	#convertIndentation(text: string): string
	{
		return text.replace(/^( {4})+/gm, (match) => '\t'.repeat(match.length / 4));
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
