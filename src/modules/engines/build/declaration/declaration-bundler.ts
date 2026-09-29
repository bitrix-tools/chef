import path from 'node:path';
import fs from 'node:fs';

import type * as ts from 'typescript/unstable/ast';
import type {
	API,
	Checker,
	CompilerOptions,
	Diagnostic,
	ModuleResolutionEntry,
	ModuleResolver,
	Program,
	ScriptKind,
	Symbol as TypeScriptSymbol,
	Type,
} from 'typescript/unstable/sync';

import { PackageResolver } from '../../../packages/package-resolver';
import { createPackageName } from '../../../../utils/package/create-package-name';
import { flattenDiagnosticText, getTypeScriptApi } from '../../../../utils/typescript-api';

/**
 * AST helpers, compiler enums and filesystem helpers of the TypeScript API in one namespace.
 */
type TypeScript = typeof import('typescript/unstable/ast')
	& typeof import('typescript/unstable/sync')
	& typeof import('typescript/unstable/fs');

export interface DeclarationBundleOptions
{
	packageRoot: string;
	input: string;
	namespace: string;
	extensionName?: string;
	compilerOptions?: CompilerOptions;
}

export interface DeclarationBundle
{
	topLevelMembers: DeclarationMember[];
	namespaceMembers: DeclarationMember[];
	namespaceMemberNames: Set<string>;
	npmModules: NpmModule[];
}

export interface DeclarationBundleResult
{
	bundle: DeclarationBundle | null;
	diagnostics: DeclarationDiagnostic[];
}

export interface DeclarationMember
{
	text: string;
	/**
	 * Unqualified variant of the member text — without namespace prefix applied to
	 * namespace members. Used when rendering the member inside `declare module '...' { ... }`
	 * where the members share the same lexical scope.
	 */
	textUnqualified?: string;
	name: string | null;
}

export interface NpmModule
{
	moduleName: string;
	body: string;
}

export async function bundleDeclarations(options: DeclarationBundleOptions): Promise<DeclarationBundleResult>
{
	const api = await getTypeScriptApi();
	const tsModule = await loadTypeScript();

	const emitted = emitSourceDeclarations(api, tsModule, options);
	if (!emitted)
	{
		return { bundle: null, diagnostics: [] };
	}

	const diagnostics = emitted.diagnostics;

	if (!emitted.entryDtsPath)
	{
		return { bundle: null, diagnostics };
	}

	const dtsProgram = createDtsProgram(
		api,
		tsModule,
		emitted.declarations,
		emitted.sourceToDts,
		emitted.npmTypesResolutions,
	);
	const collector = new SymbolCollector(tsModule, api, dtsProgram.program, {
		packageRoot: options.packageRoot,
		extensionName: options.extensionName ?? null,
		tsconfigPaths: options.compilerOptions?.paths,
		sourceImports: emitted.sourceImports,
		sourceToDts: emitted.sourceToDts,
		declarationSources: emitted.declarationSources,
		bundleSources: emitted.bundleSources,
		entrySourcePath: options.input,
	});

	try
	{
		const entryFile = dtsProgram.program.getSourceFile(emitted.entryDtsPath);
		if (!entryFile)
		{
			return { bundle: null, diagnostics };
		}

		const members = collector.collectFromEntry(entryFile, options.namespace);

		if (members.length === 0)
		{
			return { bundle: null, diagnostics };
		}

		const inlineDetections = collector.detectInlinedSiblingTypes();
		const inlineDiagnostics = inlineDetections.map((detection): DeclarationDiagnostic => {
			const rendered = formatInlinedSiblingMessage(detection);
			return {
				code: 0,
				message: rendered.heading,
				details: rendered.details,
				severity: 'warning',
				file: detection.sourceFile ?? options.input,
				line: detection.line,
				column: detection.column,
			};
		});

		return {
			bundle: splitMembers(members, collector.getNpmModules()),
			diagnostics: [...diagnostics, ...inlineDiagnostics],
		};
	}
	finally
	{
		collector.dispose();
		dtsProgram.dispose();
	}
}

async function loadTypeScript(): Promise<TypeScript>
{
	const [ast, compiler, fileSystem] = await Promise.all([
		import('typescript/unstable/ast'),
		import('typescript/unstable/sync'),
		import('typescript/unstable/fs'),
	]);

	return { ...ast, ...compiler, ...fileSystem };
}

const DTS_INLINING_DOCS_URL = 'https://bitrix-tools.github.io/chef/guide/dts-inlining';

/**
 * Higher rank = more specific recipe. Used to prefer e.g. a Vue-components classification
 * over a generic one when multiple references to the same symbol exist in one export.
 */
function rankInlineKind(kind: InlinedSiblingKind): number
{
	switch (kind)
	{
		case 'vue-components': return 3;
		case 'computed-arrow': return 2;
		case 'export-const': return 1;
		default: return 0;
	}
}

function formatInlinedSiblingMessage(detection: InlinedSiblingDetection): { heading: string; details: string }
{
	const { siblingName, symbolName, exportName, kind, propertyName } = detection;

	const heading = `"${symbolName}" from ${siblingName} is being inlined into the public .d.ts of "${exportName}".`;
	const fix = formatInlineFixRecipe(symbolName, kind, propertyName);
	const why = (
		`Why: every consumer of this extension would get the full ${symbolName} shape duplicated `
		+ `into their .d.ts. When ${symbolName} changes upstream, the inlined copy goes stale until rebuilt.`
	);
	const docs = `Docs: ${DTS_INLINING_DOCS_URL}`;

	return { heading, details: `${fix}\n\n${why}\n\n${docs}` };
}

function formatInlineFixRecipe(symbolName: string, kind: InlinedSiblingKind, propertyName: string | null): string
{
	const prop = propertyName ?? symbolName;

	switch (kind)
	{
		case 'vue-components':
		{
			return (
				`Fix: pin the type on the \`components\` map so TypeScript keeps the namespace reference.\n`
				+ `    components: { ${prop} } as { ${prop}: typeof ${prop} },`
			);
		}
		case 'computed-arrow':
		{
			return (
				`Fix: turn the arrow into a regular computed method with an explicit return type.\n`
				+ `    ${prop}(): typeof ${prop}\n`
				+ `    {\n`
				+ `        return ${prop};\n`
				+ `    },`
			);
		}
		case 'export-const':
		{
			return (
				`Fix: annotate the export with the original type to preserve the namespace reference.\n`
				+ `    export const ${prop}: typeof ${symbolName} = ...;`
			);
		}
		default:
		{
			return (
				`Fix: add an explicit type annotation that names ${symbolName} (e.g. \`: typeof ${symbolName}\`) `
				+ `at the location above, so TypeScript writes a namespace reference instead of inlining the shape.`
			);
		}
	}
}

interface CollectedMember
{
	text: string;
	textUnqualified?: string;
	name: string | null;
	kind: 'type' | 'namespaceMember';
	sourceDecl?: ts.Node;
	sourceTextStart?: number;
	renames?: Array<{ start: number; end: number; replacement: string }>;
}

interface SymbolCollectorOptions
{
	packageRoot: string;
	extensionName: string | null;
	tsconfigPaths?: Record<string, string[]>;
	sourceImports?: Set<string>;
	sourceToDts?: Map<string, string>;
	/** Maps an emitted .d.ts back to the source it was emitted from. */
	declarationSources?: Map<string, string>;
	/** Sources that end up in this extension's own bundle (see `collectBundleSources`). */
	bundleSources?: Set<string>;
	/** Absolute path of the original entry .ts file. Used to locate inline warnings in source. */
	entrySourcePath?: string;
}

interface NpmPackageBuffer
{
	statements: string[];
	seenSymbolKeys: Set<string>;
}

class SymbolCollector
{
	readonly #ts: TypeScript;
	readonly #api: API;
	readonly #program: Program;
	readonly #checker: Checker;
	readonly #seen = new Set<string>();
	readonly #seenSourceDecls = new Set<ts.Node>();
	readonly #result: CollectedMember[] = [];
	readonly #visitingSymbols = new Set<TypeScriptSymbol>();
	readonly #siblingReplacements = new Map<TypeScriptSymbol, string>();
	readonly #siblingNamespaces = new Map<TypeScriptSymbol, string>();
	readonly #options: SymbolCollectorOptions;
	readonly #npmPackages = new Map<string, NpmPackageBuffer>();
	readonly #npmReplacements = new Map<TypeScriptSymbol, string>();
	/** Maps a symbol originating from an npm package to that package's internal module name. */
	readonly #npmPackageOfSymbol = new Map<TypeScriptSymbol, string>();
	/** Cache: siblingName → set of npm package names it re-exports from its own entry. */
	readonly #siblingNpmOwnership = new Map<string, Set<string>>();
	/** Sibling extensions whose entry we've seen imported by the current bundle. */
	readonly #importedSiblings = new Map<string, ts.SourceFile | null>();

	// Cache for #findExtensionReExportingPath: maps "<modulePath> <qualifier>" to the
	// extension that re-exports that file (namespace + exported name), or null when none does.
	readonly #pathOwningExtension = new Map<string, { namespace: string; exportedName: string } | null>();
	#currentNamespace = '';

	/** Files parsed outside the dts program; they live in the compiler process until disposed. */
	readonly #standaloneSourceFiles: Array<{ dispose(): void }> = [];
	readonly #defaultLibraryFiles = new Map<ts.SourceFile, boolean>();
	#moduleResolver: ModuleResolver | null = null;

	constructor(tsModule: TypeScript, api: API, program: Program, options: SymbolCollectorOptions)
	{
		this.#ts = tsModule;
		this.#api = api;
		this.#program = program;
		this.#checker = program.getProject().checker;
		this.#options = options;
	}

	dispose(): void
	{
		for (const sourceFile of this.#standaloneSourceFiles)
		{
			sourceFile.dispose();
		}

		this.#moduleResolver?.dispose();
	}

	/**
	 * Parses a file that is not part of the dts program. Only its syntax is inspected:
	 * the checker knows nothing about these nodes.
	 */
	#parseStandaloneSourceFile(fileName: string, text: string, scriptKind?: ScriptKind): ts.SourceFile
	{
		const retained = this.#api.createSourceFile(fileName, text, scriptKind === undefined ? undefined : { scriptKind });
		this.#standaloneSourceFiles.push(retained);

		return retained.sourceFile;
	}

	readonly #symbolsAtLocation = new Map<ts.Node, TypeScriptSymbol | undefined>();

	/**
	 * Every checker call is a round trip to the compiler process, and the same identifiers
	 * are looked up by several passes over the collected members.
	 */
	#getSymbolAtLocation(node: ts.Node): TypeScriptSymbol | undefined
	{
		if (!this.#symbolsAtLocation.has(node))
		{
			this.#symbolsAtLocation.set(node, this.#checker.getSymbolAtLocation(node));
		}

		return this.#symbolsAtLocation.get(node);
	}

	#getModuleResolver(): ModuleResolver
	{
		this.#moduleResolver ??= this.#api.createModuleResolver(this.#program.getCompilerOptions());

		return this.#moduleResolver;
	}

	#isBuiltinLibFile(sourceFile: ts.SourceFile): boolean
	{
		if (sourceFile.fileName.includes('node_modules/@types/node/'))
		{
			return true;
		}

		let isDefaultLibrary = this.#defaultLibraryFiles.get(sourceFile);
		if (isDefaultLibrary === undefined)
		{
			isDefaultLibrary = this.#program.isSourceFileDefaultLibrary(sourceFile);
			this.#defaultLibraryFiles.set(sourceFile, isDefaultLibrary);
		}

		return isDefaultLibrary;
	}

	/**
	 * Whether a file of the dts program was emitted from a source of this extension's bundle.
	 * Sources of other extensions get into the program through aliases and import types;
	 * their declarations are referenced, never copied into this bundle.
	 */
	#isBundleDeclarationFile(sourceFile: ts.SourceFile): boolean
	{
		const source = this.#options.declarationSources?.get(path.normalize(sourceFile.fileName));

		return source !== undefined && this.#isBundleSource(source);
	}

	/**
	 * Whether declarations may be copied into this bundle. Types (interfaces and type aliases)
	 * are always copied: bundles declare them at the top level, not under a namespace, so there
	 * is nothing to reference. Values are copied only from this extension's own bundle files;
	 * values of other extensions live under their namespace and are referenced there.
	 */
	#canCopyDeclarations(declarations: readonly ts.Declaration[]): boolean
	{
		const ts = this.#ts;

		return declarations.some((d) => this.#isBundleDeclarationFile(d.getSourceFile()))
			|| declarations.every((d) => ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d));
	}

	#bundleSourceStems: Set<string> | null = null;

	/**
	 * `sourcePath` may come without an extension: TS writes import specifiers without one.
	 */
	#isBundleSource(sourcePath: string): boolean
	{
		this.#bundleSourceStems ??= new Set(
			[...(this.#options.bundleSources ?? [])].map((source) => stripKnownExtension(source)),
		);

		const stem = stripKnownExtension(sourcePath);

		return this.#bundleSourceStems.has(stem) || this.#bundleSourceStems.has(path.join(stem, 'index'));
	}

	getNpmModules(): NpmModule[]
	{
		if (!this.#options.extensionName) return [];

		const result: NpmModule[] = [];
		for (const [pkgName, buffer] of this.#npmPackages)
		{
			result.push({
				moduleName: `${this.#options.extensionName}/internal/${pkgName}`,
				body: buffer.statements.join('\n\n'),
			});
		}

		return result;
	}

	collectFromEntry(entryFile: ts.SourceFile, namespace: string): CollectedMember[]
	{
		this.#currentNamespace = namespace;

		const moduleSymbol = this.#getSymbolAtLocation(entryFile);
		if (!moduleSymbol)
		{
			return [];
		}

		// Register sibling extensions up-front from the original source-file imports
		// (which the declaration emit may have stripped). This lets later npm detection
		// check sibling ownership even if a specific npm symbol never flows through a
		// sibling-aliased identifier in the emitted dts.
		this.#registerSiblingsFromSourceImports();

		const exports = this.#sortBySourceOrder(entryFile, this.#checker.getExportsOfModule(moduleSymbol));

		for (const exportSymbol of exports)
		{
			this.#collectExportSymbol(exportSymbol, exportSymbol.name);
		}

		this.#applyCollectedReplacements(namespace);

		return this.#result;
	}

	/**
	 * Exports in the order they are written in the entry, which decides the order of the whole
	 * bundle. TypeScript 7 returns module exports in an order of its own. Names that come through
	 * `export * from` take the place of that statement.
	 */
	#sortBySourceOrder(entryFile: ts.SourceFile, exports: readonly TypeScriptSymbol[]): TypeScriptSymbol[]
	{
		const ts = this.#ts;

		const reExportIndexByFile = new Map<string, number>();
		entryFile.statements.forEach((statement, index) => {
			if (!ts.isExportDeclaration(statement) || statement.exportClause || !statement.moduleSpecifier) return;

			const moduleSymbol = this.#getSymbolAtLocation(statement.moduleSpecifier);
			const moduleFile = moduleSymbol ? getDeclarations(moduleSymbol)[0]?.getSourceFile() : undefined;
			if (moduleFile && !reExportIndexByFile.has(moduleFile.fileName))
			{
				reExportIndexByFile.set(moduleFile.fileName, index);
			}
		});

		const getStatementIndex = (node: ts.Node): number => {
			let current = node;
			while (current.parent && current.parent !== entryFile)
			{
				current = current.parent;
			}

			return entryFile.statements.indexOf(current as ts.Statement);
		};

		const getSortKey = (symbol: TypeScriptSymbol): [number, number] => {
			const declaration = getDeclarations(symbol)[0];
			if (!declaration) return [Infinity, 0];

			const sourceFile = declaration.getSourceFile();
			if (sourceFile === entryFile) return [getStatementIndex(declaration), declaration.pos];

			return [reExportIndexByFile.get(sourceFile.fileName) ?? Infinity, declaration.pos];
		};

		const keys = new Map(exports.map((symbol) => [symbol, getSortKey(symbol)]));

		return [...exports].sort((a, b) => {
			const [statementA, positionA] = keys.get(a)!;
			const [statementB, positionB] = keys.get(b)!;

			return statementA - statementB || positionA - positionB;
		});
	}

	/**
	 * Detect locations in the emitted .d.ts where a structural object type is actually
	 * the inlined shape of a value imported from a sibling extension. This happens when
	 * the user omitted an explicit type annotation on an export and TS expanded the type
	 * during declaration emit, dropping the link to the sibling import. Each detection
	 * tells the user where to add an annotation to keep the .d.ts compact and namespaced.
	 */
	detectInlinedSiblingTypes(): InlinedSiblingDetection[]
	{
		const ts = this.#ts;
		if (this.#importedSiblings.size === 0) return [];

		// We need to match sibling-owned types via the `.d.ts` files inside our dtsProgram —
		// the type checker speaks in terms of those files, not the original `.ts` sources.
		// Map each sibling's emitted `.d.ts` (looked up through `sourceToDts`) back to its
		// extension name so that we can identify inlined shapes during AST traversal.
		const siblingDtsToName = new Map<ts.SourceFile, string>();
		const sourceToDts = this.#options.sourceToDts;
		for (const [name, sourceFile] of this.#importedSiblings)
		{
			if (!sourceFile) continue;

			const dtsPath = sourceToDts?.get(path.normalize(sourceFile.fileName));
			if (!dtsPath) continue;

			const dtsFile = this.#program.getSourceFile(dtsPath);
			if (dtsFile) siblingDtsToName.set(dtsFile, name);
		}

		if (siblingDtsToName.size === 0) return [];

		const detections: InlinedSiblingDetection[] = [];
		const seenKeys = new Set<string>();

		for (const member of this.#result)
		{
			if (!member.sourceDecl) continue;

			const visit = (node: ts.Node): void => {
				if (ts.isTypeLiteralNode(node))
				{
					const match = this.#matchSiblingShape(node, siblingDtsToName);
					if (match)
					{
						const exportName = member.name ?? '<anonymous>';
						const located = this.#locateInOriginalSource(exportName, match.symbolName);
						const detection: InlinedSiblingDetection = {
							exportName,
							siblingName: match.siblingName,
							symbolName: match.symbolName,
							kind: located?.kind ?? 'generic',
							propertyName: located?.propertyName ?? null,
							sourceFile: located?.sourceFile ?? null,
							line: located?.line ?? null,
							column: located?.column ?? null,
						};
						const key = `${detection.exportName}:${detection.siblingName}:${detection.symbolName}:${detection.kind}:${detection.propertyName ?? ''}`;
						if (!seenKeys.has(key))
						{
							seenKeys.add(key);
							detections.push(detection);
						}

						return;
					}
				}

				node.forEachChild(visit);
			};

			visit(member.sourceDecl);
		}

		return detections;
	}

	#entrySourceFile: ts.SourceFile | null | undefined = undefined;

	#getEntrySourceFile(): ts.SourceFile | null
	{
		if (this.#entrySourceFile !== undefined) return this.#entrySourceFile;

		const entryPath = this.#options.entrySourcePath;
		if (!entryPath || !fs.existsSync(entryPath))
		{
			this.#entrySourceFile = null;
			return null;
		}

		const text = fs.readFileSync(entryPath, 'utf-8');
		this.#entrySourceFile = this.#parseStandaloneSourceFile(entryPath, text);
		return this.#entrySourceFile;
	}

	/**
	 * Locate where the inlined sibling shape sits in the **original .ts source** (not the
	 * emitted .d.ts). Returns precise file/line/column and an inline-kind classification
	 * that drives the fix recipe in the warning.
	 *
	 * Strategy:
	 * - Open entry .ts and find the `export` declaration matching `exportName`.
	 * - Walk its AST looking for an identifier reference to `symbolName`.
	 * - The first match wins. If we land inside `components: {...}` of `defineComponent`,
	 *   it's `vue-components`. Inside `computed: {...}` with an arrow returning the symbol,
	 *   it's `computed-arrow`. Bare top-level export without annotation — `export-const`.
	 */
	#locateInOriginalSource(exportName: string, symbolName: string): {
		kind: InlinedSiblingKind;
		propertyName: string | null;
		sourceFile: string;
		line: number;
		column: number;
	} | null
	{
		const ts = this.#ts;
		const entryFile = this.#getEntrySourceFile();
		if (!entryFile) return null;

		const exportDecl = this.#findExportDeclaration(entryFile, exportName);
		if (!exportDecl) return null;

		// First pass — try to find a reference to symbolName via the most informative idioms.
		let bestMatch: { node: ts.Node; kind: InlinedSiblingKind; propertyName: string | null } | null = null;

		const visit = (node: ts.Node): void => {
			if (bestMatch && bestMatch.kind !== 'generic') return;

			if (ts.isIdentifier(node) && node.text === symbolName)
			{
				const context = this.#classifyOriginalContext(node, symbolName);
				if (context)
				{
					if (!bestMatch || rankInlineKind(context.kind) > rankInlineKind(bestMatch.kind))
					{
						bestMatch = { node, kind: context.kind, propertyName: context.propertyName };
					}
				}
			}

			node.forEachChild(visit);
		};

		visit(exportDecl);

		// Fall back to the export declaration position itself — better than nothing.
		const anchor = (bestMatch as null | { node: ts.Node; kind: InlinedSiblingKind; propertyName: string | null })?.node ?? exportDecl;
		const { line, character } = entryFile.getLineAndCharacterOfPosition(anchor.getStart(entryFile));

		return {
			kind: (bestMatch as null | { node: ts.Node; kind: InlinedSiblingKind; propertyName: string | null })?.kind ?? 'export-const',
			propertyName: (bestMatch as null | { node: ts.Node; kind: InlinedSiblingKind; propertyName: string | null })?.propertyName ?? null,
			sourceFile: entryFile.fileName,
			line: line + 1,
			column: character + 1,
		};
	}

	#findExportDeclaration(file: ts.SourceFile, exportName: string): ts.Node | null
	{
		const ts = this.#ts;

		for (const stmt of file.statements)
		{
			if (ts.isVariableStatement(stmt) && stmt.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword))
			{
				for (const decl of stmt.declarationList.declarations)
				{
					if (ts.isIdentifier(decl.name) && decl.name.text === exportName) return stmt;
				}
			}

			if (
				(ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt))
				&& stmt.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
				&& stmt.name
				&& stmt.name.text === exportName
			)
			{
				return stmt;
			}
		}

		return null;
	}

	/**
	 * Given an identifier reference inside the original entry source, figure out which
	 * idiom is wrapping it. Returns null if the identifier is in a position that doesn't
	 * cause inline (e.g. inside an `import`/comment).
	 */
	#classifyOriginalContext(idNode: ts.Identifier, symbolName: string): { kind: InlinedSiblingKind; propertyName: string | null } | null
	{
		const ts = this.#ts;
		let propertyName: string | null = null;

		for (let cursor: ts.Node | undefined = idNode; cursor; cursor = cursor.parent)
		{
			// Imports / type-only references don't contribute to inline, skip identifiers
			// reached through them.
			if (ts.isImportDeclaration(cursor) || ts.isImportSpecifier(cursor)) return null;
			if (ts.isTypeReferenceNode(cursor) || ts.isTypeQueryNode(cursor)) return null;

			if (ts.isShorthandPropertyAssignment(cursor) || ts.isPropertyAssignment(cursor))
			{
				const name = cursor.name;
				if (propertyName === null && (ts.isIdentifier(name) || ts.isStringLiteral(name)))
				{
					propertyName = name.text;
				}

				const container = this.#findEnclosingObjectProperty(cursor.parent);
				if (container === 'components') return { kind: 'vue-components', propertyName: propertyName ?? symbolName };
				if (container === 'computed') return { kind: 'computed-arrow', propertyName: propertyName ?? symbolName };
				if (container === 'methods') return { kind: 'generic', propertyName: propertyName ?? symbolName };
			}

			if (ts.isVariableDeclaration(cursor))
			{
				const isExportedConst = cursor.parent
					&& ts.isVariableDeclarationList(cursor.parent)
					&& cursor.parent.parent
					&& ts.isVariableStatement(cursor.parent.parent)
					&& cursor.parent.parent.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword);
				if (isExportedConst && !cursor.type)
				{
					return { kind: 'export-const', propertyName: ts.isIdentifier(cursor.name) ? cursor.name.text : propertyName };
				}
			}
		}

		return { kind: 'generic', propertyName };
	}

	/**
	 * Looks for the property assignment (e.g. `components: { ... }`) that contains a given
	 * object-literal expression. Returns the property name or `null` if the literal is not
	 * a direct child of one.
	 */
	#findEnclosingObjectProperty(node: ts.Node): string | null
	{
		const ts = this.#ts;
		if (!ts.isObjectLiteralExpression(node)) return null;
		const parent = node.parent;
		if (!parent) return null;
		if (!ts.isPropertyAssignment(parent)) return null;
		const name = parent.name;
		if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
		return null;
	}

	#matchSiblingShape(
		node: ts.TypeLiteralNode,
		siblingDtsToName: Map<ts.SourceFile, string>,
	): InlinedSiblingMatch | null
	{
		const type = this.#checker.getTypeAtLocation(node);

		// Direct symbol match: works when the literal is e.g. `IconClass` (named class
		// declaration) — the symbol's declarations point at the sibling .d.ts file.
		const symbol = type.getAliasSymbol() ?? type.getSymbol();
		if (symbol)
		{
			const decls = getDeclarations(symbol);
			for (const decl of decls)
			{
				const siblingName = siblingDtsToName.get(decl.getSourceFile());
				if (siblingName)
				{
					return { siblingName, symbolName: symbol.name };
				}
			}
		}

		// Anonymous object types (e.g. `as const` exports like `Outline`) inline into a
		// new `__type` symbol pointing at our own file, losing the link to the sibling.
		// Match by structural identity instead: precompute the type of each top-level
		// export of every imported sibling and compare with TypeChecker.
		return this.#matchAnonymousAgainstSiblingExports(type, siblingDtsToName);
	}

	#siblingExportTypes: Array<{ type: Type; siblingName: string; symbolName: string }> | null = null;

	#getSiblingExportTypes(siblingDtsToName: Map<ts.SourceFile, string>): Array<{ type: Type; siblingName: string; symbolName: string }>
	{
		if (this.#siblingExportTypes) return this.#siblingExportTypes;

		const result: Array<{ type: Type; siblingName: string; symbolName: string }> = [];
		const visited = new Set<ts.SourceFile>();
		const seenSymbols = new Set<TypeScriptSymbol>();

		const ts = this.#ts;

		const collect = (dtsFile: ts.SourceFile, siblingName: string): void => {
			if (visited.has(dtsFile)) return;
			visited.add(dtsFile);

			const moduleSymbol = this.#getSymbolAtLocation(dtsFile);
			if (moduleSymbol)
			{
				const exports = this.#checker.getExportsOfModule(moduleSymbol);
				for (const exportSymbol of exports)
				{
					if (seenSymbols.has(exportSymbol)) continue;
					seenSymbols.add(exportSymbol);

					const decls = getDeclarations(exportSymbol);
					if (decls.length === 0) continue;

					const type = this.#checker.getTypeOfSymbolAtLocation(exportSymbol, decls[0]);
					// Skip primitive / trivially-named types — matching them is too prone to
					// false positives (e.g. `any`, `string`, simple unions).
					const flags = type.flags;
					if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) continue;
					if (flags & (ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.Boolean)) continue;

					// Skip structurally empty exports (e.g. `Object.freeze({} as const)` →
					// `Readonly<{}>`). They are mutually assignable to every `{}` produced by
					// declaration emit (empty slot bags inside `DefineComponent<...>` and so on),
					// causing a flood of false-positive matches.
					if (this.#isStructurallyEmpty(type)) continue;

					result.push({ type, siblingName, symbolName: exportSymbol.name });
				}
			}

			for (const stmt of dtsFile.statements)
			{
				if (!ts.isExportDeclaration(stmt)) continue;
				if (stmt.exportClause) continue;
				if (!stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;

				const transitiveName = stmt.moduleSpecifier.text;
				if (!isSiblingExtensionName(transitiveName)) continue;

				const transitiveDts = this.#resolveSiblingDtsFile(transitiveName);
				if (!transitiveDts) continue;

				collect(transitiveDts, transitiveName);
			}
		};

		for (const [dtsFile, siblingName] of siblingDtsToName)
		{
			collect(dtsFile, siblingName);
		}

		this.#siblingExportTypes = result;

		return result;
	}

	/**
	 * A type is "structurally empty" when it carries no observable members — no properties,
	 * no call/construct signatures, no index signatures. Such types (`{}`, `Readonly<{}>`,
	 * `Record<string, never>` and friends) are mutually assignable to one another and to any
	 * other empty shape, so comparing them via `isTypeAssignableTo` produces meaningless
	 * matches.
	 */
	#isStructurallyEmpty(type: Type): boolean
	{
		if (type.isUnionType() || type.isIntersectionType())
		{
			return type.getTypes().every((part) => this.#isStructurallyEmpty(part));
		}

		if (this.#checker.getPropertiesOfType(type).length > 0) return false;
		if (type.getCallSignatures().length > 0) return false;
		if (type.getConstructSignatures().length > 0) return false;
		if (this.#checker.getIndexInfosOfType(type).length > 0) return false;

		return true;
	}

	#resolveSiblingDtsFile(siblingName: string): ts.SourceFile | null
	{
		const sourceFile = this.#resolveSiblingSourceFile(siblingName);
		if (!sourceFile) return null;

		const dtsPath = this.#options.sourceToDts?.get(path.normalize(sourceFile.fileName));
		if (!dtsPath) return null;

		return this.#program.getSourceFile(dtsPath) ?? null;
	}

	#matchAnonymousAgainstSiblingExports(
		type: Type,
		siblingDtsToName: Map<ts.SourceFile, string>,
	): InlinedSiblingMatch | null
	{
		// Empty `{}` literals appear all over emitted declarations (slots/exposed/etc. inside
		// Vue's `DefineComponent<...>`) and are mutually assignable to any other empty shape.
		// Without this guard they trigger false-positive matches against sibling exports like
		// `Object.freeze({} as const)`.
		if (this.#isStructurallyEmpty(type)) return null;

		const candidates = this.#getSiblingExportTypes(siblingDtsToName);
		if (candidates.length === 0) return null;

		// Mutual assignability is the closest practical approximation of "same type".
		// Strict identity (`===`) doesn't survive the round-trip through declaration emit
		// (the literal is reconstructed as a fresh anonymous type), and string comparison
		// breaks on render differences like `Readonly<{...}>` vs the expanded `{readonly ...}`.
		for (const candidate of candidates)
		{
			if (this.#checker.isTypeAssignableTo(type, candidate.type) && this.#checker.isTypeAssignableTo(candidate.type, type))
			{
				return { siblingName: candidate.siblingName, symbolName: candidate.symbolName };
			}
		}

		return null;
	}

	#registerSiblingsFromSourceImports(): void
	{
		const specs = this.#options.sourceImports;
		if (!specs) return;

		for (const spec of specs)
		{
			if (!isSiblingExtensionName(spec)) continue;
			if (!PackageResolver.resolve(spec)) continue;

			if (!this.#importedSiblings.has(spec))
			{
				this.#importedSiblings.set(spec, this.#resolveSiblingSourceFile(spec));
			}
		}
	}

	#applyCollectedReplacements(namespace: string): void
	{
		const namespaceMemberSymbols = this.#collectNamespaceMemberSymbols();
		const hasExternal = this.#siblingReplacements.size > 0 || this.#npmReplacements.size > 0;
		// A cross-extension type reached through a container (e.g. `Cache.MemoryCache`) is
		// emitted as an import type of the other extension's source file, with no registered
		// sibling/npm replacement. Such import types are detected separately; the owning
		// extension is looked up through tsconfig `paths`.
		const resolvesCrossExtensionImports = Boolean(this.#options.tsconfigPaths);
		const needsNamespaceQualification = namespaceMemberSymbols.size > 0;

		for (const member of this.#result)
		{
			if (member.sourceDecl === undefined || member.sourceTextStart === undefined)
			{
				// Pre-rendered member (e.g. builtin alias) — already finalized.
				continue;
			}

			const externalEdits = hasExternal
				? this.#findExternalEdits(member.sourceDecl, member.sourceTextStart)
				: [];

			if (resolvesCrossExtensionImports)
			{
				externalEdits.push(...this.#findCrossExtensionEdits(member.sourceDecl, member.sourceTextStart));
			}

			const renames = member.renames ?? [];

			const sourceText = member.text;

			const nsEdits = (needsNamespaceQualification && member.kind === 'type')
				? this.#findNamespaceQualificationEdits(
					member.sourceDecl,
					member.sourceTextStart,
					namespaceMemberSymbols,
					namespace,
				)
				: [];

			// Namespace qualification takes priority over external (npm/sibling) edits
			// that overlap the same position — a symbol that exists as our namespace member
			// should not be inlined as npm.
			const externalEditsFiltered = externalEdits.filter((ext) => {
				return !nsEdits.some((ns) => rangesOverlap(ns, ext));
			});

			member.textUnqualified = applyPositionalEdits(sourceText, externalEditsFiltered, renames);

			if (nsEdits.length > 0)
			{
				member.text = applyPositionalEdits(sourceText, [...externalEditsFiltered, ...nsEdits], renames);
			}
			else
			{
				member.text = member.textUnqualified;
			}
		}
	}

	#collectNamespaceMemberSymbols(): Set<TypeScriptSymbol>
	{
		const ts = this.#ts;
		const result = new Set<TypeScriptSymbol>();

		for (const member of this.#result)
		{
			if (member.kind !== 'namespaceMember' || !member.sourceDecl) continue;

			const decl = member.sourceDecl;
			const nameNodes: ts.Identifier[] = [];

			if (ts.isClassDeclaration(decl) || ts.isFunctionDeclaration(decl))
			{
				if (decl.name) nameNodes.push(decl.name);
			}
			else if (ts.isEnumDeclaration(decl))
			{
				nameNodes.push(decl.name);
			}
			else if (ts.isVariableStatement(decl))
			{
				const first = decl.declarationList.declarations[0];
				if (first) nameNodes.push(...getBindingIdentifiers(ts, first.name));
			}

			for (const nameNode of nameNodes)
			{
				const sym = this.#getSymbolAtLocation(nameNode);
				if (sym) result.add(sym);
			}
		}

		return result;
	}

	#findNamespaceQualificationEdits(
		decl: ts.Node,
		textStart: number,
		namespaceMemberSymbols: Set<TypeScriptSymbol>,
		namespace: string,
	): Array<{ start: number; end: number; replacement: string }>
	{
		const ts = this.#ts;
		const edits: Array<{ start: number; end: number; replacement: string }> = [];
		const sourceFile = decl.getSourceFile();

		const visit = (node: ts.Node): void => {
			if (ts.isIdentifier(node) && this.#isReferencePosition(node))
			{
				const symbol = this.#getSymbolAtLocation(node);
				const resolved = symbol ? (this.#resolveAliasDeep(symbol) ?? symbol) : null;
				if (resolved && namespaceMemberSymbols.has(resolved))
				{
					const nodeStart = node.getStart(sourceFile, false) - textStart;
					const nodeEnd = node.getEnd() - textStart;
					edits.push({ start: nodeStart, end: nodeEnd, replacement: `${namespace}.${node.text}` });
				}
			}

			node.forEachChild(visit);
		};

		visit(decl);

		return edits;
	}

	#findExternalEdits(decl: ts.Node, textStart: number): Array<{ start: number; end: number; replacement: string }>
	{
		const ts = this.#ts;
		const edits: Array<{ start: number; end: number; replacement: string }> = [];
		const sourceFile = decl.getSourceFile();

		const visit = (node: ts.Node): void => {
			// Handle `import("pkg").X<...>` — rewrite only the head (everything up to `<`).
			// Type arguments are traversed normally below so nested ImportTypeNodes are handled.
			if (ts.isImportTypeNode(node))
			{
				const edit = this.#buildImportTypeEdit(node, sourceFile, textStart);
				if (edit) edits.push(edit);
			}

			if (ts.isIdentifier(node) && this.#isReferencePosition(node))
			{
				const symbol = this.#getSymbolAtLocation(node);
				if (symbol)
				{
					const replacement = this.#siblingReplacements.get(symbol) ?? this.#npmReplacements.get(symbol);
					if (replacement)
					{
						const nodeStart = node.getStart(sourceFile, false) - textStart;
						const nodeEnd = node.getEnd() - textStart;
						edits.push({ start: nodeStart, end: nodeEnd, replacement });
					}
				}
			}

			node.forEachChild(visit);
		};

		visit(decl);

		return edits;
	}

	/**
	 * Rewrites references to values of other extensions into a namespace reference:
	 * - import types TS emits for a type reached through a container class (e.g.
	 *   `new Cache.MemoryCache()` → `import("../../../core/src/lib/cache/memory-cache").default`);
	 * - plain names inside types copied from another extension (e.g. `Button` in `PopupButton`).
	 * References to this extension's own bundle files and to copied types stay as they are.
	 */
	#findCrossExtensionEdits(decl: ts.Node, textStart: number): Array<{ start: number; end: number; replacement: string }>
	{
		const ts = this.#ts;
		const edits: Array<{ start: number; end: number; replacement: string }> = [];
		const sourceFile = decl.getSourceFile();

		const visit = (node: ts.Node): void => {
			if (ts.isImportTypeNode(node)
				&& node.qualifier
				&& ts.isLiteralTypeNode(node.argument)
				&& ts.isStringLiteral(node.argument.literal)
				&& node.argument.literal.text.startsWith('.'))
			{
				const targetFile = this.#resolveImportTypeSource(sourceFile, node.argument.literal.text);
				if (targetFile && !this.#isBundleSource(targetFile) && !this.#isCopiedImportType(node))
				{
					const qualifierText = node.qualifier.getText(sourceFile);
					const owningExtension = this.#findExtensionReExportingPath(targetFile, qualifierText);
					if (owningExtension)
					{
						const headStart = node.getStart(sourceFile, false) - textStart;
						const headEnd = node.typeArguments && node.typeArguments.length > 0
							? (node.typeArguments.pos - 1) - textStart
							: node.getEnd() - textStart;
						edits.push({
							start: headStart,
							end: headEnd,
							replacement: `${owningExtension.namespace}.${owningExtension.exportedName}`,
						});
					}
				}
			}

			if (ts.isIdentifier(node) && this.#isReferencePosition(node))
			{
				const replacement = this.#findCrossExtensionReference(node);
				if (replacement)
				{
					edits.push({
						start: node.getStart(sourceFile, false) - textStart,
						end: node.getEnd() - textStart,
						replacement,
					});
				}
			}

			node.forEachChild(visit);
		};

		visit(decl);

		return edits;
	}

	/**
	 * Namespace reference for a name that points at a value declared in another extension's
	 * source, or null when the name is this bundle's own or cannot be attributed.
	 */
	#findCrossExtensionReference(node: ts.Identifier): string | null
	{
		const symbol = this.#getSymbolAtLocation(node);
		if (!symbol) return null;

		const resolved = this.#resolveAliasDeep(symbol) ?? symbol;
		const declarations = getDeclarations(resolved);
		if (declarations.length === 0 || this.#canCopyDeclarations(declarations)) return null;

		// Only emitted declarations have a source; npm packages and lib files are handled elsewhere.
		const source = this.#options.declarationSources?.get(path.normalize(declarations[0].getSourceFile().fileName));
		if (!source) return null;

		const owningExtension = this.#findExtensionReExportingPath(source, resolved.name);
		if (owningExtension)
		{
			return `${owningExtension.namespace}.${owningExtension.exportedName}`;
		}

		// Not exported by name: a value reached through another extension's public types is
		// still declared under that extension's namespace in its own bundle.
		const namespace = resolved.name === 'default' ? null : this.#findOwningNamespace(source);

		return namespace ? `${namespace}.${resolved.name}` : null;
	}

	readonly #owningNamespaces = new Map<string, string | null>();

	/**
	 * Namespace of the extension a source file belongs to: the nearest directory above the
	 * file that has a bundle config.
	 */
	#findOwningNamespace(sourcePath: string): string | null
	{
		const sourceDirectory = path.dirname(sourcePath);
		if (this.#owningNamespaces.has(sourceDirectory))
		{
			return this.#owningNamespaces.get(sourceDirectory) ?? null;
		}

		let namespace: string | null = null;
		for (let directory = sourceDirectory; directory !== path.dirname(directory); directory = path.dirname(directory))
		{
			const hasBundleConfig = BUNDLE_CONFIG_FILES.some((fileName) => fs.existsSync(path.join(directory, fileName)));
			if (!hasBundleConfig) continue;

			const extensionName = createPackageName(directory);
			const pkg = extensionName ? PackageResolver.resolve(extensionName) : null;
			const extensionNamespace = pkg?.getGlobal()[pkg.getName()];
			namespace = extensionNamespace && extensionNamespace !== 'window' ? extensionNamespace : null;
			break;
		}

		this.#owningNamespaces.set(sourceDirectory, namespace);

		return namespace;
	}

	/**
	 * Whether the symbol an import type names is copied into this bundle (a type), so the
	 * import type is rewritten to the copy instead of a namespace reference.
	 */
	#isCopiedImportType(node: ts.ImportTypeNode): boolean
	{
		const leftmost = getEntityNameLeft(this.#ts, node.qualifier!);
		const symbol = leftmost ? this.#getSymbolAtLocation(leftmost) : undefined;
		if (!symbol) return false;

		const resolved = this.#resolveAliasDeep(symbol) ?? symbol;
		const declarations = getDeclarations(resolved);

		return declarations.length > 0 && this.#canCopyDeclarations(declarations);
	}

	/**
	 * The source file a relative `import("...")` inside an emitted declaration points at,
	 * resolved against the source that declaration was emitted from.
	 */
	#resolveImportTypeSource(dtsFile: ts.SourceFile, specifier: string): string | null
	{
		const source = this.#options.declarationSources?.get(path.normalize(dtsFile.fileName));
		if (!source) return null;

		return path.resolve(path.dirname(source), specifier);
	}

	#buildLocalImportTypeEdit(
		node: ts.ImportTypeNode,
		resolved: TypeScriptSymbol,
		headStart: number,
		headEnd: number,
		qualifierText: string,
	): { start: number; end: number; replacement: string } | null
	{
		const ts = this.#ts;

		// Only handle `import("./relative-path").X` — non-relative is handled elsewhere.
		if (!ts.isLiteralTypeNode(node.argument)) return null;
		if (!ts.isStringLiteral(node.argument.literal)) return null;
		if (!node.argument.literal.text.startsWith('.')) return null;

		// Symbol must be backed by declarations inside our own dts program (i.e. our extension's source).
		const declarations = getDeclarations(resolved);
		if (declarations.length === 0) return null;

		const isLocal = declarations.some((d) => {
			const src = d.getSourceFile();
			if (src.fileName.includes('node_modules')) return false;
			if (this.#isBuiltinLibFile(src)) return false;

			return this.#program.getSourceFile(src.fileName) === src;
		});
		if (!isLocal || !this.#canCopyDeclarations(declarations)) return null;

		// Use the leftmost identifier of the qualifier as the public name.
		// For `import("./x").Foo` → "Foo"; for `import("./x").Foo.Bar` → still rooted at "Foo".
		const leftmost = getEntityNameLeft(ts, node.qualifier!);
		if (!leftmost) return null;
		const memberName = leftmost.text;
		const restOfQualifier = qualifierText.slice(memberName.length); // ".Bar" or ""

		// Make sure the symbol gets collected as a member if it isn't already.
		if (!this.#hasCollectedMember(resolved))
		{
			this.#tryCollectReferencedName(leftmost);
		}

		const collected = this.#findCollectedMember(resolved);
		if (!collected) return null;

		const replacement = collected.kind === 'type'
			? `${memberName}${restOfQualifier}`
			: `${this.#currentNamespace}.${memberName}${restOfQualifier}`;

		return { start: headStart, end: headEnd, replacement };
	}

	#hasCollectedMember(symbol: TypeScriptSymbol): boolean
	{
		const key = `:${getSymbolKey(symbol)}`;
		for (const seenKey of this.#seen)
		{
			if (seenKey.endsWith(key)) return true;
		}

		return false;
	}

	#findCollectedMember(symbol: TypeScriptSymbol): CollectedMember | null
	{
		const ts = this.#ts;
		const declarations = getDeclarations(symbol);
		if (declarations.length === 0) return null;

		const targetFile = declarations[0].getSourceFile().fileName;
		const symName = symbol.name;

		for (const member of this.#result)
		{
			if (member.name !== symName) continue;
			if (!member.sourceDecl) continue;

			const memberFile = member.sourceDecl.getSourceFile().fileName;
			if (memberFile === targetFile) return member;
		}

		void ts;

		return null;
	}

	#buildImportTypeEdit(
		node: ts.ImportTypeNode,
		sourceFile: ts.SourceFile,
		textStart: number,
	): { start: number; end: number; replacement: string } | null
	{
		const ts = this.#ts;

		if (!node.qualifier) return null;

		const qualifierLeft = getEntityNameLeft(ts, node.qualifier);
		if (!qualifierLeft) return null;

		// The "head" of an ImportTypeNode is the part before type arguments:
		// `import("pkg").QualifierPath` — everything up to `<` (or the end of node if no `<`).
		const headStart = node.getStart(sourceFile, false) - textStart;
		const headEnd = node.typeArguments && node.typeArguments.length > 0
			? (node.typeArguments.pos - 1) - textStart // position of '<'
			: node.getEnd() - textStart;
		const qualifierText = node.qualifier.getText(sourceFile);

		const symbol = this.#getSymbolAtLocation(qualifierLeft);
		if (!symbol) return null;

		const resolved = this.#resolveAliasDeep(symbol) ?? symbol;

		// Local file (relative import like `import("./header").Data`) — the symbol lives
		// in our own dts graph. We may have already collected it as a member or need to.
		const localEdit = this.#buildLocalImportTypeEdit(node, resolved, headStart, headEnd, qualifierText);
		if (localEdit) return localEdit;

		// Sibling extension — rewrite the head as `BX.Namespace.QualifierPath`.
		const siblingNs = this.#siblingNamespaces.get(symbol) ?? this.#siblingNamespaces.get(resolved);
		if (siblingNs)
		{
			return {
				start: headStart,
				end: headEnd,
				replacement: `${siblingNs}.${qualifierText}`,
			};
		}

		const pkgName = this.#npmPackageOfSymbol.get(symbol) ?? this.#npmPackageOfSymbol.get(resolved);
		if (!pkgName || !this.#options.extensionName) return null;

		// Sibling owns this npm package → rewrite the head as `BX.<Ns>.QualifierPath`.
		const owner = this.#findSiblingOwnerForPackage(pkgName);
		if (owner)
		{
			return {
				start: headStart,
				end: headEnd,
				replacement: `${owner.namespace}.${qualifierText}`,
			};
		}

		// Fallback: rewrite just the module literal inside `import("...")`.
		if (!ts.isLiteralTypeNode(node.argument)) return null;
		if (!ts.isStringLiteral(node.argument.literal)) return null;

		const literal = node.argument.literal;
		const literalStart = literal.getStart(sourceFile, false) - textStart;
		const literalEnd = literal.getEnd() - textStart;
		const containerModule = `${this.#options.extensionName}/internal/${pkgName}`;

		return {
			start: literalStart,
			end: literalEnd,
			replacement: `'${containerModule}'`,
		};
	}

	#isReferencePosition(node: ts.Identifier): boolean
	{
		const ts = this.#ts;
		const parent = node.parent;
		if (!parent) return false;

		if (ts.isTypeReferenceNode(parent) && parent.typeName === node) return true;
		if (ts.isExpressionWithTypeArguments(parent) && parent.expression === node) return true;
		if (ts.isQualifiedName(parent) && parent.left === node) return true;
		if (ts.isTypeQueryNode(parent) && parent.exprName === node) return true;
		if (ts.isHeritageClause(parent)) return true;

		return false;
	}

	#collectExportSymbol(symbol: TypeScriptSymbol, publicName: string): void
	{
		const resolved = this.#resolveAliasDeep(symbol);
		if (!resolved)
		{
			return;
		}

		const key = `${publicName}:${getSymbolKey(resolved)}`;
		if (this.#seen.has(key))
		{
			return;
		}

		this.#seen.add(key);

		const declarations = getDeclarations(resolved);

		if (declarations.length === 0)
		{
			return;
		}

		for (const decl of declarations)
		{
			const member = this.#buildMemberFromDeclaration(decl, publicName, resolved);
			if (!member)
			{
				continue;
			}

			// Multiple destructuring exports (`export const { a, b, c } = X`) all point at
			// the same VariableStatement. Rendering it once per declaration would duplicate
			// the whole statement; dedupe by source declaration node identity.
			if (member.sourceDecl && this.#seenSourceDecls.has(member.sourceDecl))
			{
				continue;
			}
			if (member.sourceDecl)
			{
				this.#seenSourceDecls.add(member.sourceDecl);
			}

			this.#result.push(member);
			this.#collectReferencedSymbols(decl);
		}
	}

	#buildMemberFromDeclaration(declaration: ts.Declaration, publicName: string, _symbol: TypeScriptSymbol): CollectedMember | null
	{
		const ts = this.#ts;

		// TypeScript 7 keeps destructuring in declarations (`export declare const { a, b }: {...}`),
		// so a name exported this way is declared by a binding element of the variable declaration.
		const decl = ts.isBindingElement(declaration)
			? getBindingRootDeclaration(ts, declaration) ?? declaration
			: declaration;

		if (ts.isVariableDeclaration(decl))
		{
			const list = decl.parent;
			if (!ts.isVariableDeclarationList(list)) return null;
			const statement = list.parent;
			if (!ts.isVariableStatement(statement)) return null;

			const nameNode = ts.isIdentifier(decl.name) ? decl.name : null;
			const originalName = nameNode?.text ?? null;
			const rendered = renderDeclaration(ts, statement, nameNode, originalName, publicName);

			return { ...rendered, name: publicName, kind: 'namespaceMember', sourceDecl: statement };
		}

		if (ts.isClassDeclaration(decl))
		{
			const nameNode = decl.name ?? null;
			const originalName = nameNode?.text ?? null;
			const rendered = renderDeclaration(ts, decl, nameNode, originalName, publicName);

			return { ...rendered, name: publicName, kind: 'namespaceMember', sourceDecl: decl };
		}

		if (ts.isFunctionDeclaration(decl))
		{
			const nameNode = decl.name ?? null;
			const originalName = nameNode?.text ?? null;
			const rendered = renderDeclaration(ts, decl, nameNode, originalName, publicName);

			return { ...rendered, name: publicName, kind: 'namespaceMember', sourceDecl: decl };
		}

		if (ts.isEnumDeclaration(decl))
		{
			const nameNode = decl.name;
			const originalName = nameNode.text;
			const rendered = renderDeclaration(ts, decl, nameNode, originalName, publicName);

			return { ...rendered, name: publicName, kind: 'namespaceMember', sourceDecl: decl };
		}

		if (ts.isInterfaceDeclaration(decl))
		{
			const nameNode = decl.name;
			const originalName = nameNode.text;
			const rendered = renderDeclaration(ts, decl, nameNode, originalName, publicName);

			return { ...rendered, name: publicName, kind: 'type', sourceDecl: decl };
		}

		if (ts.isTypeAliasDeclaration(decl))
		{
			const nameNode = decl.name;
			const originalName = nameNode.text;
			const rendered = renderDeclaration(ts, decl, nameNode, originalName, publicName);

			return { ...rendered, name: publicName, kind: 'type', sourceDecl: decl };
		}

		return null;
	}

	#collectReferencedSymbols(decl: ts.Declaration): void
	{
		const ts = this.#ts;

		const visit = (node: ts.Node): void => {
			if (ts.isTypeReferenceNode(node))
			{
				const nameNode = getEntityNameLeft(ts, node.typeName);
				if (nameNode)
				{
					this.#tryCollectReferencedName(nameNode);
				}
			}

			if (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression))
			{
				this.#tryCollectReferencedName(node.expression);
			}

			if (ts.isIdentifier(node) && this.#isTypePosition(node))
			{
				this.#tryCollectReferencedName(node);
			}

			if (ts.isComputedPropertyName(node) && ts.isIdentifier(node.expression))
			{
				this.#tryCollectReferencedName(node.expression);
			}

			if (ts.isTypeQueryNode(node))
			{
				const nameNode = getEntityNameLeft(ts, node.exprName);
				if (nameNode)
				{
					this.#tryCollectReferencedName(nameNode);
				}
			}

			if (ts.isImportTypeNode(node) && node.qualifier)
			{
				const nameNode = getEntityNameLeft(ts, node.qualifier);
				if (nameNode)
				{
					this.#tryCollectReferencedName(nameNode);
				}
			}

			node.forEachChild(visit);
		};

		visit(decl);
	}

	#isTypePosition(node: ts.Identifier): boolean
	{
		const ts = this.#ts;
		const parent = node.parent;

		if (!parent) return false;
		if (ts.isTypeReferenceNode(parent) && parent.typeName === node) return true;
		if (ts.isHeritageClause(parent)) return true;
		if (ts.isExpressionWithTypeArguments(parent) && parent.expression === node) return true;
		if (ts.isTypeQueryNode(parent) && parent.exprName === node) return true;

		return false;
	}

	#tryCollectReferencedName(node: ts.EntityName | ts.Identifier): void
	{
		const ts = this.#ts;
		const symbol = this.#getSymbolAtLocation(node);
		if (!symbol)
		{
			return;
		}

		const siblingReplacement = this.#tryRegisterSiblingExtension(symbol);
		if (siblingReplacement)
		{
			return;
		}

		const resolved = this.#resolveAliasDeep(symbol);
		if (!resolved)
		{
			return;
		}

		const nodeName = ts.isIdentifier(node) ? node.text : null;

		if (this.#visitingSymbols.has(resolved))
		{
			return;
		}

		const declarations = getDeclarations(resolved);
		if (declarations.length === 0)
		{
			if (nodeName)
			{
				this.#collectTypeAlias(symbol, nodeName, node);
			}

			return;
		}

		const isBuiltin = declarations.some((d) => this.#isBuiltinLibFile(d.getSourceFile()));

		if (isBuiltin)
		{
			if (nodeName && symbol.name !== resolved.name)
			{
				this.#collectTypeAlias(symbol, nodeName, node);
			}

			return;
		}

		const isInNodeModules = declarations.every((d) => d.getSourceFile().fileName.includes('node_modules'));

		if (isInNodeModules)
		{
			if (nodeName)
			{
				this.#tryRegisterNpmPackage(symbol, resolved, nodeName, declarations);
			}

			return;
		}

		const isInProgram = declarations.some((d) => {
			const src = d.getSourceFile();

			return this.#program.getSourceFile(src.fileName) === src;
		});

		if (!isInProgram)
		{
			if (nodeName)
			{
				this.#tryRegisterNpmPackage(symbol, resolved, nodeName, declarations);
			}

			return;
		}

		if (!this.#canCopyDeclarations(declarations))
		{
			return;
		}

		const name = this.#extractDeclarationName(resolved, declarations);
		if (!name)
		{
			return;
		}

		// A type re-exported under another name (`export type { User as ImModelUser }`) is copied
		// under its own name, so the name the reference uses becomes an alias of the copy.
		const isType = declarations.every((d) => ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d));
		if (nodeName && nodeName !== name && isType)
		{
			this.#collectTypeAlias(symbol, nodeName, node);
		}

		const key = `${name}:${getSymbolKey(resolved)}`;
		if (this.#seen.has(key))
		{
			return;
		}

		this.#visitingSymbols.add(resolved);
		this.#seen.add(key);

		for (const decl of declarations)
		{
			const member = this.#buildMemberFromDeclaration(decl, name, resolved);
			if (member)
			{
				this.#result.push(member);
				this.#collectReferencedSymbols(decl);
			}
		}

		this.#visitingSymbols.delete(resolved);
	}

	#tryRegisterNpmPackage(symbol: TypeScriptSymbol, resolved: TypeScriptSymbol, nodeName: string, declarations: readonly ts.Declaration[]): void
	{
		if (!this.#options.extensionName) return;

		const pkgName = this.#findNpmPackageName(declarations);
		if (!pkgName) return;

		const targetName = resolved.name && resolved.name !== 'default' ? resolved.name : nodeName;

		// If an imported sibling extension owns types from this npm package, reference
		// its ambient namespace (BX.<Namespace>.<Type>) instead of inlining a duplicate
		// copy into our own bundle. The sibling's hand-written entry (or generated dts)
		// is expected to re-declare the type under `declare global namespace BX.<Ns> { ... }`.
		const owner = this.#findSiblingOwnerForPackage(pkgName);

		if (owner)
		{
			const replacement = `${owner.namespace}.${targetName}`;
			this.#npmReplacements.set(symbol, replacement);
			this.#npmReplacements.set(resolved, replacement);
			this.#npmPackageOfSymbol.set(symbol, pkgName);
			this.#npmPackageOfSymbol.set(resolved, pkgName);

			return;
		}

		const containerModule = `${this.#options.extensionName}/internal/${pkgName}`;
		const replacement = `import('${containerModule}').${targetName}`;

		this.#npmReplacements.set(symbol, replacement);
		this.#npmReplacements.set(resolved, replacement);
		this.#npmPackageOfSymbol.set(symbol, pkgName);
		this.#npmPackageOfSymbol.set(resolved, pkgName);

		const buffer = this.#getOrCreateNpmBuffer(pkgName);
		this.#inlineNpmDeclarations(resolved, buffer, targetName);
	}

	#findNpmPackageName(declarations: readonly ts.Declaration[]): string | null
	{
		for (const decl of declarations)
		{
			const src = decl.getSourceFile();
			if (this.#isBuiltinLibFile(src)) continue;

			const match = /node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/.exec(src.fileName);
			if (match)
			{
				const pkgName = match[1];
				if (pkgName === 'typescript' || pkgName === '@types/node') continue;

				return pkgName;
			}
		}

		return null;
	}

	#getOrCreateNpmBuffer(pkgName: string): NpmPackageBuffer
	{
		let buffer = this.#npmPackages.get(pkgName);
		if (!buffer)
		{
			buffer = { statements: [], seenSymbolKeys: new Set() };
			this.#npmPackages.set(pkgName, buffer);
		}

		return buffer;
	}

	#inlineNpmDeclarations(symbol: TypeScriptSymbol, buffer: NpmPackageBuffer, publicName: string): void
	{
		const ts = this.#ts;
		const declarations = getDeclarations(symbol);
		if (declarations.length === 0) return;

		const key = `${publicName}:${getSymbolKey(symbol)}`;
		if (buffer.seenSymbolKeys.has(key)) return;
		buffer.seenSymbolKeys.add(key);

		for (const decl of declarations)
		{
			if (ts.isSourceFile(decl)) continue;

			const rendered = this.#renderNpmDeclaration(decl, publicName);
			if (rendered)
			{
				buffer.statements.push(rendered);
			}

			this.#collectNpmReferencedSymbols(decl, buffer);
		}
	}

	#renderNpmDeclaration(decl: ts.Declaration, publicName: string): string | null
	{
		const ts = this.#ts;
		const parent = decl.parent;

		// Unwrap `declare module 'x' { ... }` — we only want the inner declarations, re-wrapped into our container.
		if (parent && ts.isModuleBlock(parent))
		{
			const sourceFile = decl.getSourceFile();
			const start = decl.getStart(sourceFile, false);
			const end = decl.getEnd();
			let text = sourceFile.text.slice(start, end);
			text = stripLeadingKeywords(text, 0);
			text = dropPrivateIdentifierLines(text);

			if (ts.isClassDeclaration(decl) || ts.isFunctionDeclaration(decl)
				|| ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl)
				|| ts.isEnumDeclaration(decl))
			{
				return `export ${text}`;
			}

			if (ts.isVariableStatement(decl))
			{
				return `export ${text}`;
			}

			return text;
		}

		if (ts.isClassDeclaration(decl) || ts.isFunctionDeclaration(decl)
			|| ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl)
			|| ts.isEnumDeclaration(decl))
		{
			const nameNode = getDeclarationNameNode(ts, decl);
			const originalName = nameNode?.text ?? null;
			const rendered = renderDeclaration(ts, decl, nameNode, originalName, publicName);
			const finalText = applyPositionalEdits(rendered.text, [], rendered.renames);

			return `export ${finalText}`;
		}

		if (ts.isVariableDeclaration(decl))
		{
			const list = decl.parent;
			if (!ts.isVariableDeclarationList(list)) return null;
			const statement = list.parent;
			if (!ts.isVariableStatement(statement)) return null;

			const nameNode = ts.isIdentifier(decl.name) ? decl.name : null;
			const originalName = nameNode?.text ?? null;
			const rendered = renderDeclaration(ts, statement, nameNode, originalName, publicName);
			const finalText = applyPositionalEdits(rendered.text, [], rendered.renames);

			return `export ${finalText}`;
		}

		return null;
	}

	#collectNpmReferencedSymbols(decl: ts.Declaration, buffer: NpmPackageBuffer): void
	{
		const ts = this.#ts;

		const visit = (node: ts.Node): void => {
			if (ts.isTypeReferenceNode(node))
			{
				const nameNode = getEntityNameLeft(ts, node.typeName);
				if (nameNode)
				{
					this.#tryInlineReferencedNpmSymbol(nameNode, buffer);
				}
			}

			if (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression))
			{
				this.#tryInlineReferencedNpmSymbol(node.expression, buffer);
			}

			node.forEachChild(visit);
		};

		visit(decl);
	}

	#tryInlineReferencedNpmSymbol(node: ts.Identifier, buffer: NpmPackageBuffer): void
	{
		const ts = this.#ts;
		const symbol = this.#getSymbolAtLocation(node);
		if (!symbol) return;

		const resolved = this.#resolveAliasDeep(symbol) ?? symbol;
		const declarations = getDeclarations(resolved);
		if (declarations.length === 0) return;

		const isBuiltin = declarations.some((d) => this.#isBuiltinLibFile(d.getSourceFile()));
		if (isBuiltin) return;

		// Only inline if symbol lives in node_modules (even across packages — we duplicate everything).
		const allInNodeModules = declarations.every((d) => d.getSourceFile().fileName.includes('node_modules'));
		if (!allInNodeModules) return;

		const name = resolved.name && resolved.name !== 'default' ? resolved.name : node.text;
		this.#inlineNpmDeclarations(resolved, buffer, name);
	}

	#tryRegisterSiblingExtension(symbol: TypeScriptSymbol): boolean
	{
		const ts = this.#ts;

		if ((symbol.flags & ts.SymbolFlags.Alias) === 0)
		{
			return false;
		}

		const decls = getDeclarations(symbol);
		if (decls.length === 0) return false;

		for (const decl of decls)
		{
			const { moduleSpecifier, importedName } = extractImportSource(ts, decl);
			if (!moduleSpecifier) continue;
			if (!isSiblingExtensionName(moduleSpecifier)) continue;

			const pkg = PackageResolver.resolve(moduleSpecifier);
			if (!pkg) continue;

			const siblingNamespace = pkg.getGlobal()[pkg.getName()];
			if (!siblingNamespace || siblingNamespace === 'window') continue;

			const localName = getImportLocalName(ts, decl);
			if (!localName) continue;

			// For default imports, the referenced symbol lives in the sibling's namespace under
			// its own declaration name. We use the local alias as a best-guess fallback
			// (which matches the typical convention of `import Foo from 'x.y'` where sibling
			// exports `class Foo`).
			const targetName = importedName && importedName !== 'default' ? importedName : localName;
			const replacement = `${siblingNamespace}.${targetName}`;

			this.#siblingReplacements.set(symbol, replacement);
			this.#siblingNamespaces.set(symbol, siblingNamespace);

			// Record that this sibling was imported; later we can check which npm packages
			// it owns so that we reference them through the sibling instead of inlining.
			if (!this.#importedSiblings.has(moduleSpecifier))
			{
				this.#importedSiblings.set(moduleSpecifier, this.#resolveSiblingSourceFile(moduleSpecifier));
			}

			return true;
		}

		return false;
	}

	#resolveSiblingSourceFile(siblingName: string): ts.SourceFile | null
	{
		const paths = this.#options.tsconfigPaths;
		if (!paths) return null;

		const mapped = paths[siblingName];
		if (!mapped || mapped.length === 0) return null;

		const baseUrl = this.#options.packageRoot;
		const ts = this.#ts;

		for (const p of mapped)
		{
			const absolute = path.isAbsolute(p) ? p : path.resolve(baseUrl, p);

			// Try to fetch from the in-memory dts program first (faster, already parsed).
			const inProgram = this.#program.getSourceFile(absolute);
			if (inProgram) return inProgram;

			// Fallback: read the file from disk and parse it ad-hoc — we only need to
			// inspect its top-level imports/exports to determine npm ownership.
			if (fs.existsSync(absolute))
			{
				const text = fs.readFileSync(absolute, 'utf-8');

				return this.#parseStandaloneSourceFile(absolute, text, this.#ts.ScriptKind.TS);
			}
		}

		return null;
	}

	#getSiblingNpmOwnership(siblingName: string, source: ts.SourceFile): Set<string>
	{
		let cached = this.#siblingNpmOwnership.get(siblingName);
		if (cached) return cached;

		// Transitively walk the top-level imports of the sibling's entry file:
		// for every imported npm package (`vue`, `pinia`, ...) we follow its
		// own top-level imports too. This is what lets us match symbols whose
		// physical declarations live in a sub-package — `DefineComponent`
		// re-exported by `vue` actually originates in `@vue/runtime-core`, so
		// without the transitive walk the sibling wouldn't be seen as its
		// owner and the type would be inlined.
		cached = new Set<string>();
		this.#collectNpmOwnershipRecursive(source, cached, new Set<string>());

		this.#siblingNpmOwnership.set(siblingName, cached);

		return cached;
	}

	#collectNpmOwnershipRecursive(
		source: ts.SourceFile,
		owned: Set<string>,
		visitedFiles: Set<string>,
	): void
	{
		if (visitedFiles.has(source.fileName)) return;
		visitedFiles.add(source.fileName);

		const ts = this.#ts;
		const containingFile = source.fileName;

		for (const stmt of source.statements)
		{
			const spec = getTopLevelModuleSpecifier(ts, stmt);
			if (!spec) continue;
			if (spec.startsWith('.')) continue;
			if (isSiblingExtensionName(spec)) continue;

			const pkgName = normalizeNpmPackageName(spec);
			if (!pkgName) continue;

			const alreadyKnown = owned.has(pkgName);
			owned.add(pkgName);

			// Only recurse into a package the first time we see it.
			if (alreadyKnown) continue;

			const resolved = this.#resolveModuleFromFile(spec, containingFile);
			if (!resolved) continue;

			const resolvedSource = this.#getOrLoadSourceFile(resolved);
			if (!resolvedSource) continue;

			this.#collectNpmOwnershipRecursive(resolvedSource, owned, visitedFiles);
		}
	}

	#resolveModuleFromFile(moduleSpecifier: string, containingFile: string): string | null
	{
		const result = this.#getModuleResolver().resolveModuleName(moduleSpecifier, path.dirname(containingFile));
		const fileName = result.resolvedModule?.resolvedFileName;
		if (!fileName) return null;

		// We only care about declaration-carrying files inside an npm package —
		// a resolution that lands in TypeScript's lib bundle tells us nothing
		// about transitive ownership.
		if (!/[\\/]node_modules[\\/]/.test(fileName)) return null;

		return fileName;
	}

	#getOrLoadSourceFile(fileName: string): ts.SourceFile | null
	{
		const ts = this.#ts;

		const inProgram = this.#program.getSourceFile(fileName);
		if (inProgram) return inProgram;

		if (!fs.existsSync(fileName)) return null;

		const text = fs.readFileSync(fileName, 'utf-8');
		const scriptKind = fileName.endsWith('.d.ts') || fileName.endsWith('.ts')
			? this.#ts.ScriptKind.TS
			: this.#ts.ScriptKind.JS;

		return this.#parseStandaloneSourceFile(fileName, text, scriptKind);
	}

	#findSiblingOwnerForPackage(pkgName: string): { siblingName: string; namespace: string } | null
	{
		const pick = (siblingName: string): { siblingName: string; namespace: string } | null => {
			const pkg = PackageResolver.resolve(siblingName);
			if (!pkg) return null;
			const namespace = pkg.getGlobal()[pkg.getName()];
			if (!namespace || namespace === 'window') return null;

			return { siblingName, namespace };
		};

		// Direct ownership: sibling entry imports the npm package by name.
		for (const [siblingName, source] of this.#importedSiblings)
		{
			if (!source) continue;
			const ownership = this.#getSiblingNpmOwnership(siblingName, source);
			if (ownership.has(pkgName)) return pick(siblingName);
		}

		// Transitive ownership: when there's a single imported sibling and the npm
		// symbol is unowned by anyone else, treat the sibling as the owner. This
		// covers transitive npm packages (e.g. sibling imports `vue`, the bundled
		// types come from `@vue/runtime-core`) without false positives across
		// multiple unrelated siblings.
		const siblings = [...this.#importedSiblings.entries()].filter(([, src]) => src !== null);
		if (siblings.length === 1) return pick(siblings[0][0]);

		return null;
	}

	/**
	 * Finds the Bitrix extension that publicly re-exports `target` and returns its
	 * namespace together with the name the symbol is exported under. Used when a type
	 * points at another extension's sources through a container (e.g. `Cache.MemoryCache`
	 * → the `MemoryCache` class in main.core), which TS emits as a relative import
	 * instead of a namespace reference.
	 *
	 * We walk the extensions declared in tsconfig `paths`, parse each entry, and match
	 * the symbol against the entry's exports through the type checker. A direct named
	 * re-export (`export { MemoryCache }`) wins over anything else.
	 */
	/**
	 * Finds the Bitrix extension whose entry re-exports the file at the emitted
	 * `import("<modulePath>")` path, and returns its namespace plus the name the file's
	 * export is re-exported under. Purely syntactic: the symbol isn't in this extension's
	 * dts program (it's a bare cross-extension path), so we parse candidate entries and
	 * match their `export`/`import`+`export` declarations against the target file.
	 *
	 * `qualifierText` is the member accessed on the import (`default` for a default class,
	 * or a named export). A direct named re-export of the target file wins.
	 */
	#findExtensionReExportingPath(
		targetFile: string,
		qualifierText: string,
	): { namespace: string; exportedName: string } | null
	{
		const cacheKey = `${targetFile} ${qualifierText}`;
		if (this.#pathOwningExtension.has(cacheKey))
		{
			return this.#pathOwningExtension.get(cacheKey) ?? null;
		}

		const result = this.#resolveExtensionReExportingPath(targetFile, qualifierText);
		this.#pathOwningExtension.set(cacheKey, result);

		return result;
	}

	#resolveExtensionReExportingPath(
		targetFile: string,
		qualifierText: string,
	): { namespace: string; exportedName: string } | null
	{
		const paths = this.#options.tsconfigPaths;
		if (!paths) return null;

		const baseUrl = this.#options.packageRoot;
		const targetDir = path.dirname(targetFile);

		for (const extensionName of Object.keys(paths))
		{
			if (!isSiblingExtensionName(extensionName)) continue;

			// The extension that re-exports a file lives next to it in the tree. Skip entries
			// whose declared path doesn't share a meaningful directory prefix with the target,
			// so we don't parse thousands of unrelated entries per import.
			const entryPath = paths[extensionName]?.[0];
			if (!entryPath) continue;
			const entryAbsolute = path.isAbsolute(entryPath) ? entryPath : path.resolve(baseUrl, entryPath);
			if (!sharesDirectoryPrefix(path.dirname(entryAbsolute), targetDir)) continue;

			const entry = this.#resolveSiblingSourceFile(extensionName);
			if (!entry) continue;

			const exportedName = this.#findReExportName(entry, targetFile, qualifierText);
			if (!exportedName) continue;

			const pkg = PackageResolver.resolve(extensionName);
			if (!pkg) continue;

			const namespace = pkg.getGlobal()[pkg.getName()];
			if (!namespace || namespace === 'window') continue;

			return { namespace, exportedName };
		}

		return null;
	}

	/**
	 * In an extension entry file, finds the name under which the target file's export
	 * (identified by `qualifierText`: `default` or a named export) is re-exported.
	 * Recognises `import X from './target'; export { X }` and `export { X } from './target'`.
	 */
	#findReExportName(entry: ts.SourceFile, targetFile: string, qualifierText: string): string | null
	{
		const ts = this.#ts;
		const entryDir = path.dirname(entry.fileName);

		// The target is the entry itself, which exports the symbol directly under this name.
		const entryStem = stripKnownExtension(entry.fileName);
		const targetStem = stripKnownExtension(targetFile);
		if (entryStem === targetStem || entryStem === path.join(targetStem, 'index'))
		{
			return qualifierText === 'default' ? null : qualifierText;
		}

		const resolvesToTarget = (specifier: string): boolean => {
			if (!specifier.startsWith('.')) return false;
			const resolved = path.resolve(entryDir, specifier);

			return stripKnownExtension(resolved) === stripKnownExtension(targetFile);
		};

		// import <local> from './target'  →  which local name binds the wanted export
		const localForWanted = new Map<string, string>(); // localName -> importedName ('default' | named)

		for (const statement of entry.statements)
		{
			if (!ts.isImportDeclaration(statement)) continue;
			if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
			if (!resolvesToTarget(statement.moduleSpecifier.text)) continue;

			const clause = statement.importClause;
			if (!clause) continue;

			if (clause.name)
			{
				localForWanted.set(clause.name.text, 'default');
			}

			if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
			{
				for (const element of clause.namedBindings.elements)
				{
					const importedName = element.propertyName?.text ?? element.name.text;
					localForWanted.set(element.name.text, importedName);
				}
			}
		}

		for (const statement of entry.statements)
		{
			if (!ts.isExportDeclaration(statement)) continue;
			if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;

			// export { X } from './target'
			if (statement.moduleSpecifier
				&& ts.isStringLiteral(statement.moduleSpecifier)
				&& resolvesToTarget(statement.moduleSpecifier.text))
			{
				for (const element of statement.exportClause.elements)
				{
					const importedName = element.propertyName?.text ?? element.name.text;
					if (importedName === qualifierText)
					{
						return element.name.text;
					}
				}
			}

			// export { X } where X was imported from './target'
			if (!statement.moduleSpecifier)
			{
				for (const element of statement.exportClause.elements)
				{
					const localName = element.propertyName?.text ?? element.name.text;
					if (localForWanted.get(localName) === qualifierText)
					{
						return element.name.text;
					}
				}
			}
		}

		return null;
	}

	#collectTypeAlias(originalSymbol: TypeScriptSymbol, aliasName: string, referenceNode: ts.Node): void
	{
		const ts = this.#ts;

		if ((originalSymbol.flags & ts.SymbolFlags.Alias) === 0)
		{
			return;
		}

		const resolved = this.#resolveAliasDeep(originalSymbol);
		if (!resolved)
		{
			return;
		}

		if (aliasName === resolved.name)
		{
			return;
		}

		const targetName = resolved.name;
		if (!targetName || targetName === 'default')
		{
			return;
		}

		const key = `${aliasName}:alias:${targetName}`;
		if (this.#seen.has(key))
		{
			return;
		}

		this.#seen.add(key);

		const generics = inferGenericParams(ts, aliasName, referenceNode);
		const text = generics
			? `type ${aliasName}${generics.params} = ${targetName}${generics.args};`
			: `type ${aliasName} = ${targetName};`;

		this.#result.push({ text, name: aliasName, kind: 'type' });
	}

	#extractDeclarationName(symbol: TypeScriptSymbol, declarations: readonly ts.Declaration[]): string | null
	{
		const ts = this.#ts;

		if (symbol.name && symbol.name !== 'default' && symbol.name !== '__export')
		{
			return symbol.name;
		}

		for (const decl of declarations)
		{
			if (ts.isClassDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isInterfaceDeclaration(decl)
				|| ts.isTypeAliasDeclaration(decl) || ts.isEnumDeclaration(decl))
			{
				if (decl.name && ts.isIdentifier(decl.name))
				{
					return decl.name.text;
				}
			}

			if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name))
			{
				return decl.name.text;
			}
		}

		return null;
	}

	#resolveAliasDeep(symbol: TypeScriptSymbol): TypeScriptSymbol | null
	{
		const ts = this.#ts;
		const SymbolFlags = ts.SymbolFlags;

		let current: TypeScriptSymbol | undefined = symbol;
		const seen = new Set<TypeScriptSymbol>();

		while (current && (current.flags & SymbolFlags.Alias) !== 0)
		{
			if (seen.has(current))
			{
				break;
			}

			seen.add(current);

			const next = this.#checker.getAliasedSymbol(current);
			if (!next || next === current)
			{
				break;
			}

			current = next;
		}

		return current ?? null;
	}
}

function splitMembers(members: CollectedMember[], npmModules: NpmModule[]): DeclarationBundle
{
	const topLevelMembers: DeclarationMember[] = [];
	const namespaceMembers: DeclarationMember[] = [];
	const namespaceMemberNames = new Set<string>();

	for (const member of members)
	{
		if (member.kind === 'type')
		{
			topLevelMembers.push({ text: member.text, textUnqualified: member.textUnqualified, name: member.name });
		}
		else
		{
			namespaceMembers.push({ text: member.text, textUnqualified: member.textUnqualified, name: member.name });
			if (member.name)
			{
				namespaceMemberNames.add(member.name);
			}
		}
	}

	return {
		topLevelMembers,
		namespaceMembers,
		namespaceMemberNames,
		npmModules,
	};
}

function renderDeclaration(
	tsModule: typeof ts,
	statement: ts.Statement,
	nameNode: ts.Identifier | null,
	originalName: string | null,
	publicName: string,
): { text: string; sourceTextStart: number; renames: Array<{ start: number; end: number; replacement: string }> }
{
	const sourceFile = statement.getSourceFile();
	const source = sourceFile.text;

	const jsdocStart = findJsDocStart(statement);
	const start = jsdocStart ?? statement.getStart(sourceFile, false);
	const end = statement.getEnd();

	const text = source.slice(start, end);

	const renames: Array<{ start: number; end: number; replacement: string }> = [];

	if (originalName && originalName !== publicName && nameNode)
	{
		const nameStart = nameNode.getStart(sourceFile, false) - start;
		const nameEnd = nameNode.getEnd() - start;
		renames.push({ start: nameStart, end: nameEnd, replacement: publicName });
	}

	return { text, sourceTextStart: start, renames };
}

function rangesOverlap(
	a: { start: number; end: number },
	b: { start: number; end: number },
): boolean
{
	return a.start < b.end && b.start < a.end;
}

function applyPositionalEdits(
	text: string,
	externalEdits: Array<{ start: number; end: number; replacement: string }>,
	renames: Array<{ start: number; end: number; replacement: string }>,
): string
{
	// Drop later edits that overlap earlier kept ones — ascending by start picks the first
	// occurrence at each position; then we apply in descending order to preserve offsets.
	const sortedAsc = [...externalEdits, ...renames].sort((a, b) => a.start - b.start);
	const kept: Array<{ start: number; end: number; replacement: string }> = [];
	for (const edit of sortedAsc)
	{
		if (kept.some((k) => rangesOverlap(k, edit))) continue;
		kept.push(edit);
	}

	const all = kept.sort((a, b) => b.start - a.start);
	let result = text;
	for (const edit of all)
	{
		if (edit.start < 0 || edit.end > result.length) continue;
		result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
	}

	// Compute declStart offset inside the (possibly rename-modified) text
	// Since rename happens at identifier position AFTER the keyword block,
	// declStart of original text equals result's decl position.
	// We re-detect declaration keyword and strip it.
	result = stripLeadingKeywordsAfterJsdoc(result);
	result = dropPrivateIdentifierLines(result);

	return result;
}

function stripLeadingKeywordsAfterJsdoc(text: string): string
{
	// Find the end of leading JSDoc/comment block (if any) then strip export/default/declare.
	let i = 0;
	// Skip leading whitespace and comments
	while (i < text.length)
	{
		// Skip whitespace
		while (i < text.length && /\s/.test(text[i])) i++;
		// Skip /* ... */ comment
		if (text.startsWith('/*', i))
		{
			const close = text.indexOf('*/', i + 2);
			if (close < 0) break;
			i = close + 2;
			continue;
		}
		// Skip // comment
		if (text.startsWith('//', i))
		{
			const nl = text.indexOf('\n', i);
			if (nl < 0) { i = text.length; break; }
			i = nl + 1;
			continue;
		}
		break;
	}

	const jsdocEnd = i;
	let rest = text.slice(jsdocEnd);

	// Strip export / default / declare in any order, with intervening whitespace.
	let changed = true;
	while (changed)
	{
		changed = false;
		const m = /^(\s*)(export|default|declare)\s+/.exec(rest);
		if (m)
		{
			rest = m[1] + rest.slice(m[0].length);
			changed = true;
		}
	}

	return text.slice(0, jsdocEnd) + rest;
}

function findJsDocStart(node: ts.Node): number | null
{
	const jsdocs = node.jsDoc;
	if (jsdocs && jsdocs.length > 0)
	{
		return jsdocs[0].getStart(node.getSourceFile(), false);
	}

	return null;
}

function stripLeadingKeywords(text: string, declStart: number): string
{
	const jsdocPart = text.slice(0, declStart);
	let decl = text.slice(declStart);
	decl = decl.replace(/^\s*export\s+/, '').replace(/^\s*default\s+/, '').replace(/^\s*declare\s+/, '');

	return jsdocPart + decl;
}

function dropPrivateIdentifierLines(text: string): string
{
	return text
		.split('\n')
		.filter((line) => line.trim() !== '#private;')
		.join('\n');
}

interface EmitResult
{
	declarations: Map<string, string>;
	sourceImports: Set<string>;
	/** Maps original .ts source file path → emitted .d.ts path inside `declarations`. */
	sourceToDts: Map<string, string>;
	/** Maps every emitted .d.ts back to the source it was emitted from. */
	declarationSources: Map<string, string>;
	/** Sources that end up in this extension's own bundle. */
	bundleSources: Set<string>;
	/** Emitted .d.ts of the extension entry, or null when TS produced none. */
	entryDtsPath: string | null;
	/** npm imports redirected from plain `.js` to the package typings; reused by the dts program. */
	npmTypesResolutions: ModuleResolutionEntry[];
	diagnostics: DeclarationDiagnostic[];
}

export interface DeclarationDiagnostic
{
	code: number;
	message: string;
	/** Long-form text (fix recipe, rationale, links) rendered after the code frame. */
	details?: string;
	severity: 'error' | 'warning';
	file: string | null;
	line: number | null;
	column: number | null;
}

export type InlinedSiblingKind =
	/** Inside `components: { Foo, Bar }` of `defineComponent({...})`. */
	| 'vue-components'
	/** Computed arrow `Foo: (): typeof Foo => Foo` inside `computed: { ... }`. */
	| 'computed-arrow'
	/** Top-level `export const Foo = ...` with no annotation. */
	| 'export-const'
	/** Anything else — fall back to the generic recipe. */
	| 'generic';

export interface InlinedSiblingDetection
{
	exportName: string;
	siblingName: string;
	symbolName: string;
	kind: InlinedSiblingKind;
	/** Property name carrying the inlined value (e.g. "BIcon" inside `components`). */
	propertyName: string | null;
	/** Absolute path of the original .ts source where the inline sits. */
	sourceFile: string | null;
	/** 1-based line number inside `sourceFile`. */
	line: number | null;
	/** 1-based column number inside `sourceFile`. */
	column: number | null;
}

interface InlinedSiblingMatch
{
	siblingName: string;
	symbolName: string;
}

function emitSourceDeclarations(
	api: API,
	tsModule: TypeScript,
	options: DeclarationBundleOptions,
): EmitResult | null
{
	const { packageRoot, compilerOptions: externalOptions } = options;
	const sourceDir = path.join(packageRoot, 'src');

	if (!fs.existsSync(sourceDir))
	{
		return null;
	}

	const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts'];
	const rootNames = collectSourceFiles(sourceDir, sourceExtensions);

	if (rootNames.length === 0)
	{
		return null;
	}

	const compilerOptions: CompilerOptions = {
		...externalOptions,
		target: tsModule.ScriptTarget.ESNext,
		module: tsModule.ModuleKind.ESNext,
		moduleResolution: tsModule.ModuleResolutionKind.Bundler,
		strict: true,
		declaration: true,
		emitDeclarationOnly: true,
		skipLibCheck: true,
		// `isolatedDeclarations` is a project-wide policy meant for typecheck/IDE feedback.
		// For chef's bundle emit it only gets in the way: when the user violates it, TS
		// skips the declaration for the affected file entirely, so we end up with no .d.ts
		// for the extension at all. Force it off here so we always get a full (possibly
		// inferred) declaration to bundle. Diagnostics from the user's typecheck pass are
		// still surfaced separately as warnings.
		isolatedDeclarations: false,
		// No `rootDir`: when an entry imports files outside `packageRoot`
		// (e.g. `main.core.minimal` pulls `../../src/lib/...` from `main.core`),
		// fixing rootDir to packageRoot makes TS skip declaration emit for those
		// files. Letting TS infer the common source directory keeps relative
		// `import` paths inside emitted .d.ts consistent with the source tree.
		//
		// `outDir` is virtual: TS uses it only to compute output paths it passes
		// to the emitted files, which
		// `emitToString` hands back in memory. Nothing is written to disk here — the user's actual
		// `bundle.config.output` is honoured separately by the `DeclarationEmitter`
		// facade, which writes the final bundled .d.ts next to the .js bundle.
		// `<packageRoot>/dist` is just a stable virtual namespace.
		outDir: path.join(packageRoot, 'dist'),
		noEmitOnError: false,
	};

	let program = api.createProgram(rootNames, compilerOptions);
	let moduleResolver: ModuleResolver | null = null;

	try
	{
		// Collect module specifiers from source files so we know about sibling imports,
		// even when TS strips them during declaration emit.
		const sourceImports = new Set<string>();
		const npmImports: Array<{ moduleName: string; containingDirectory: string }> = [];
		for (const rootName of rootNames)
		{
			const src = program.getSourceFile(rootName);
			if (!src) continue;
			for (const stmt of src.statements)
			{
				const spec = getTopLevelModuleSpecifier(tsModule, stmt);
				if (!spec) continue;

				sourceImports.add(spec);
				if (!spec.startsWith('.') && !compilerOptions.paths?.[spec])
				{
					npmImports.push({ moduleName: spec, containingDirectory: path.dirname(rootName) });
				}
			}
		}

		// Rare case: an npm import resolves to plain `.js`. The program is rebuilt with those
		// imports pinned to the package typings.
		const npmTypesResolutions = collectNpmTypesResolutions(api, compilerOptions, npmImports);
		if (npmTypesResolutions.length > 0)
		{
			program.dispose();
			moduleResolver = api.createModuleResolver(compilerOptions, {
				moduleResolutions: { fallback: 'resolve', entries: npmTypesResolutions },
			});
			program = api.createProgram(rootNames, compilerOptions, { moduleResolver });
		}

		const output = program.emitToString(tsModule.EmitOnly.OnlyDts);

		const declarations = new Map<string, string>();
		const dtsBySource = new Map<string, string>();
		const declarationSources = new Map<string, string>();
		for (const [fileName, file] of output.outputFiles)
		{
			if (!fileName.endsWith('.d.ts')) continue;

			const dtsPath = path.normalize(fileName);
			declarations.set(dtsPath, file.text);

			if (file.sourceFileName)
			{
				const sourcePath = path.normalize(file.sourceFileName);
				dtsBySource.set(sourcePath, dtsPath);
				declarationSources.set(dtsPath, sourcePath);
			}
		}

		// The dts program resolves `import` paths written relative to the original .ts source
		// location through this mapping; declarations emitted for .js sources are not needed there.
		const sourceToDts = new Map<string, string>();
		for (const [sourcePath, dtsPath] of dtsBySource)
		{
			if (/\.(?:tsx?|mts|cts)$/.test(sourcePath))
			{
				sourceToDts.set(sourcePath, dtsPath);
			}
		}

		const ownSourceFiles = new Set(rootNames.map((name) => path.normalize(name)));
		const diagnostics = collectOwnDiagnostics(tsModule, output.diagnostics, ownSourceFiles);

		if (declarations.size === 0 && diagnostics.length === 0)
		{
			return null;
		}

		const entryDtsPath = findEntryDeclarationPath(options.input, packageRoot, dtsBySource, declarations);

		const bundleSources = collectBundleSources(tsModule, program, rootNames);

		return {
			declarations,
			sourceImports,
			sourceToDts,
			declarationSources,
			bundleSources,
			entryDtsPath,
			npmTypesResolutions,
			diagnostics,
		};
	}
	finally
	{
		program.dispose();
		moduleResolver?.dispose();
	}
}

/**
 * Sources that end up in the extension's own bundle: its root files plus everything they reach
 * through relative imports, as the bundler does. Files reached only through an alias
 * (`main.core`) belong to other extensions, even though their declarations are emitted too.
 */
function collectBundleSources(tsModule: TypeScript, program: Program, rootNames: string[]): Set<string>
{
	const programFiles = new Set(program.getSourceFileNames().map((fileName) => path.normalize(fileName)));
	const bundleSources = new Set<string>();
	const queue = rootNames.map((fileName) => path.normalize(fileName));

	while (queue.length > 0)
	{
		const fileName = queue.pop()!;
		if (bundleSources.has(fileName)) continue;
		bundleSources.add(fileName);

		const sourceFile = program.getSourceFile(fileName);
		if (!sourceFile) continue;

		for (const statement of sourceFile.statements)
		{
			const specifier = getTopLevelModuleSpecifier(tsModule, statement);
			if (!specifier?.startsWith('.')) continue;

			const target = resolveRelativeProgramFile(path.dirname(fileName), specifier, programFiles);
			if (target && !bundleSources.has(target))
			{
				queue.push(target);
			}
		}
	}

	return bundleSources;
}

function resolveRelativeProgramFile(directory: string, specifier: string, programFiles: Set<string>): string | null
{
	const base = stripKnownExtension(path.resolve(directory, specifier));
	const candidates = [
		...KNOWN_MODULE_EXTENSIONS.map((extension) => base + extension),
		...KNOWN_MODULE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
	];

	return candidates.find((candidate) => programFiles.has(candidate)) ?? null;
}

function collectOwnDiagnostics(
	tsModule: TypeScript,
	emitDiagnostics: readonly Diagnostic[],
	ownSourceFiles: Set<string>,
): DeclarationDiagnostic[]
{
	const seen = new Set<string>();
	const result: DeclarationDiagnostic[] = [];

	// Only emit-time diagnostics — these are the ones that actually affect what TS writes
	// to the .d.ts (e.g. "exported variable cannot be named", isolatedDeclarations issues).
	// Pre-emit / typecheck errors are surfaced through `chef typecheck` instead, and
	// pulling them in here would turn every legacy type error in the project into a build
	// warning.
	for (const diagnostic of emitDiagnostics)
	{
		const fileName = diagnostic.fileName;
		if (!fileName) continue;
		if (!ownSourceFiles.has(path.normalize(fileName))) continue;

		const { line, character } = diagnostic.startPosition ?? { line: 0, character: 0 };
		const message = flattenDiagnosticText(diagnostic);
		const severity = diagnostic.category === tsModule.DiagnosticCategory.Error ? 'error' : 'warning';

		const key = `${fileName}:${line}:${character}:${diagnostic.code}:${message}`;
		if (seen.has(key)) continue;
		seen.add(key);

		result.push({
			code: diagnostic.code,
			message,
			severity,
			file: fileName,
			line: line + 1,
			column: character + 1,
		});
	}

	return result;
}

/**
 * Pins npm imports that standard resolution maps to plain `.js` (typically a subpath exported
 * without a `types` condition, like `vue/dist/*`) to the `.d.ts` the package ships.
 *
 * The pins are computed up front instead of in a resolution callback: the compiler resolves
 * modules in parallel, and calling back into the API from inside such a callback is not safe.
 */
function collectNpmTypesResolutions(
	api: API,
	compilerOptions: CompilerOptions,
	imports: Array<{ moduleName: string; containingDirectory: string }>,
): ModuleResolutionEntry[]
{
	if (imports.length === 0)
	{
		return [];
	}

	const resolver = api.createModuleResolver(compilerOptions);
	const entries: ModuleResolutionEntry[] = [];
	const seen = new Set<string>();

	try
	{
		for (const { moduleName, containingDirectory } of imports)
		{
			if (seen.has(moduleName)) continue;
			seen.add(moduleName);

			const resolved = resolver.resolveModuleName(moduleName, containingDirectory).resolvedModule;
			if (!resolved || resolved.extension !== '.js' || !resolved.isExternalLibraryImport) continue;

			const patched = resolveNpmTypesFallback(resolved.resolvedFileName, resolved.packageId?.name);
			if (patched)
			{
				entries.push({ moduleName, result: { resolvedFileName: patched, packageId: resolved.packageId } });
			}
		}
	}
	finally
	{
		resolver.dispose();
	}

	return entries;
}

function resolveNpmTypesFallback(jsFilePath: string, packageName: string | undefined): string | null
{
	const candidates = [
		jsFilePath.replace(/\.js$/, '.d.ts'),
		jsFilePath.replace(/\.js$/, '.d.mts'),
	];

	for (const candidate of candidates)
	{
		if (fs.existsSync(candidate)) return candidate;
	}

	if (!packageName) return null;

	// Find package.json by walking up from jsFilePath
	let dir = path.dirname(jsFilePath);
	while (dir !== path.dirname(dir))
	{
		const pkgJson = path.join(dir, 'package.json');
		if (fs.existsSync(pkgJson))
		{
			try
			{
				const json = JSON.parse(fs.readFileSync(pkgJson, 'utf-8'));
				if (json.name !== packageName)
				{
					dir = path.dirname(dir);
					continue;
				}

				const types = json.types ?? json.typings;
				if (typeof types === 'string')
				{
					const typesPath = path.join(dir, types);
					if (fs.existsSync(typesPath)) return typesPath;
				}
			}
			catch
			{
				// ignore malformed package.json
			}

			break;
		}

		dir = path.dirname(dir);
	}

	return null;
}

function findEntryDeclarationPath(
	input: string,
	packageRoot: string,
	dtsBySource: Map<string, string>,
	declarations: Map<string, string>,
): string | null
{
	const outDir = path.join(packageRoot, 'dist');
	const sourceExtRe = /\.(?:tsx?|mts|cts|jsx?|mjs|cjs)$/;

	// When `rootDir` is not set, TS lays emitted files out relative to the deepest common
	// ancestor of all inputs. For `main.core.minimal` whose entry imports from `../../src/lib/...`,
	// that is the parent extension's root, so the path is taken from the emit itself.
	const emitted = dtsBySource.get(path.normalize(input));
	if (emitted && declarations.has(emitted))
	{
		return emitted;
	}

	// Fallback: legacy layout where rootDir was packageRoot.
	const legacyRelative = path.relative(packageRoot, input).replace(sourceExtRe, '.d.ts');
	const legacyExpected = path.normalize(path.join(outDir, legacyRelative));
	if (declarations.has(legacyExpected))
	{
		return legacyExpected;
	}

	// Last resort: match by basename.
	const basename = path.basename(input).replace(sourceExtRe, '.d.ts');
	for (const key of declarations.keys())
	{
		if (path.basename(key) === basename)
		{
			return key;
		}
	}

	return null;
}

interface DtsProgram
{
	program: Program;
	dispose(): void;
}

/**
 * A program over the declarations emitted in memory. They are served to the compiler as a
 * filesystem layer on top of the real disk, so npm packages and lib files still resolve.
 */
function createDtsProgram(
	api: API,
	tsModule: TypeScript,
	declarations: Map<string, string>,
	sourceToDts: Map<string, string>,
	npmTypesResolutions: ModuleResolutionEntry[],
): DtsProgram
{
	const compilerOptions: CompilerOptions = {
		target: tsModule.ScriptTarget.ESNext,
		module: tsModule.ModuleKind.ESNext,
		moduleResolution: tsModule.ModuleResolutionKind.Bundler,
		skipLibCheck: true,
		strict: false,
		noResolve: false,
		allowJs: false,
		declaration: false,
		noEmit: true,
		allowImportingTsExtensions: true,
	};

	const entries = [...npmTypesResolutions, ...collectSourceRelativeResolutions(declarations, sourceToDts)];
	const moduleResolver = entries.length > 0
		? api.createModuleResolver(compilerOptions, { moduleResolutions: { fallback: 'resolve', entries } })
		: null;

	const snapshot = api.createSnapshot({
		fileSystem: tsModule.createFileSystemLayer([...declarations]),
		createPrograms: [{
			rootFiles: [...declarations.keys()],
			compilerOptions,
			options: moduleResolver ? { moduleResolver } : undefined,
		}],
	});

	return {
		program: snapshot.operation.createdPrograms[0],
		dispose: () => {
			snapshot.dispose();
			moduleResolver?.dispose();
		},
	};
}

const RELATIVE_SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.\.?(?:\/[^'"]*)?)\1/g;

/**
 * Relative imports inside the emitted declarations resolve against the in-memory files by
 * standard resolution. The exception is a path TS wrote relative to the *original* source
 * location; it is mapped to the emitted .d.ts of that source through `sourceToDts`.
 */
function collectSourceRelativeResolutions(
	declarations: Map<string, string>,
	sourceToDts: Map<string, string>,
): ModuleResolutionEntry[]
{
	const entries: ModuleResolutionEntry[] = [];

	for (const [fileName, text] of declarations)
	{
		const containingDirectory = path.dirname(fileName);
		const seen = new Set<string>();

		for (const match of text.matchAll(RELATIVE_SPECIFIER_PATTERN))
		{
			const moduleName = match[2];
			if (seen.has(moduleName)) continue;
			seen.add(moduleName);

			const baseResolved = path.resolve(containingDirectory, moduleName);
			const candidates = [
				baseResolved + '.d.ts',
				baseResolved + '.ts',
				path.join(baseResolved, 'index.d.ts'),
				path.join(baseResolved, 'index.ts'),
			].map((candidate) => path.normalize(candidate));

			if (candidates.some((candidate) => declarations.has(candidate))) continue;

			const dtsPath = candidates
				.map((candidate) => sourceToDts.get(candidate))
				.find((mapped) => mapped && declarations.has(mapped));

			if (dtsPath)
			{
				entries.push({ moduleName, containingDirectory, result: { resolvedFileName: dtsPath } });
			}
		}
	}

	return entries;
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

const EXTENSION_NAME_PATTERN = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/;

function getTopLevelModuleSpecifier(tsModule: typeof ts, stmt: ts.Statement): string | null
{
	if (tsModule.isImportDeclaration(stmt) && tsModule.isStringLiteral(stmt.moduleSpecifier))
	{
		return stmt.moduleSpecifier.text;
	}

	if (tsModule.isExportDeclaration(stmt) && stmt.moduleSpecifier && tsModule.isStringLiteral(stmt.moduleSpecifier))
	{
		return stmt.moduleSpecifier.text;
	}

	return null;
}

function normalizeNpmPackageName(specifier: string): string | null
{
	// `@scope/pkg/subpath` → `@scope/pkg`; `pkg/subpath` → `pkg`.
	if (specifier.startsWith('@'))
	{
		const match = /^(@[^/]+\/[^/]+)/.exec(specifier);

		return match ? match[1] : null;
	}

	const match = /^([^/]+)/.exec(specifier);

	return match ? match[1] : null;
}

function isSiblingExtensionName(name: string): boolean
{
	return EXTENSION_NAME_PATTERN.test(name);
}

const BUNDLE_CONFIG_FILES = ['bundle.config.js', 'bundle.config.ts'];

const KNOWN_MODULE_EXTENSIONS = ['.d.ts', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Whether two directories share a prefix deep enough that one could re-export files from
 * the other — i.e. they belong to the same Bitrix extension subtree. Used to avoid parsing
 * thousands of unrelated extension entries when resolving a cross-extension import path.
 *
 * Extensions live under `.../<module>/install/js/<module>/<extension>/...`; we require the
 * common prefix to reach at least one segment past `install/js` (the module), so files in
 * completely different modules/extensions are skipped.
 */
export function sharesDirectoryPrefix(dirA: string, dirB: string): boolean
{
	const segmentsA = dirA.split(path.sep);
	const segmentsB = dirB.split(path.sep);

	let common = 0;
	while (common < segmentsA.length && common < segmentsB.length && segmentsA[common] === segmentsB[common])
	{
		common += 1;
	}

	const marker = segmentsA.indexOf('js');
	if (marker >= 0 && segmentsA[marker - 1] === 'install')
	{
		// Require the common prefix to reach past `install/js/<module>`.
		return common > marker + 2;
	}

	// Fallback for non-standard layouts: any non-trivial shared prefix.
	return common >= 3;
}

/**
 * Drops a known module extension so paths compare equal regardless of how they were written
 * (`.../memory-cache` vs `.../memory-cache.ts` vs `.../memory-cache.d.ts`).
 */
export function stripKnownExtension(filePath: string): string
{
	for (const ext of KNOWN_MODULE_EXTENSIONS)
	{
		if (filePath.endsWith(ext))
		{
			return filePath.slice(0, -ext.length);
		}
	}

	return filePath;
}

function extractImportSource(
	tsModule: typeof ts,
	decl: ts.Declaration,
): { moduleSpecifier: string | null; importedName: string | null }
{
	if (tsModule.isImportSpecifier(decl))
	{
		const importDecl = decl.parent.parent.parent;
		const moduleSpec = tsModule.isImportDeclaration(importDecl) && tsModule.isStringLiteral(importDecl.moduleSpecifier)
			? importDecl.moduleSpecifier.text
			: null;
		const importedName = decl.propertyName?.text ?? decl.name.text;

		return { moduleSpecifier: moduleSpec, importedName };
	}

	if (tsModule.isImportClause(decl))
	{
		const importDecl = decl.parent;
		const moduleSpec = tsModule.isImportDeclaration(importDecl) && tsModule.isStringLiteral(importDecl.moduleSpecifier)
			? importDecl.moduleSpecifier.text
			: null;

		return { moduleSpecifier: moduleSpec, importedName: 'default' };
	}

	if (tsModule.isNamespaceImport(decl))
	{
		const importDecl = decl.parent.parent;
		const moduleSpec = tsModule.isImportDeclaration(importDecl) && tsModule.isStringLiteral(importDecl.moduleSpecifier)
			? importDecl.moduleSpecifier.text
			: null;

		return { moduleSpecifier: moduleSpec, importedName: null };
	}

	return { moduleSpecifier: null, importedName: null };
}

function getImportLocalName(tsModule: typeof ts, decl: ts.Declaration): string | null
{
	if (tsModule.isImportSpecifier(decl)) return decl.name.text;
	if (tsModule.isImportClause(decl)) return decl.name?.text ?? null;
	if (tsModule.isNamespaceImport(decl)) return decl.name.text;

	return null;
}

function inferGenericParams(tsModule: typeof ts, aliasName: string, referenceNode: ts.Node): { params: string; args: string } | null
{
	let parent: ts.Node | undefined = referenceNode.parent;
	while (parent)
	{
		if (tsModule.isTypeReferenceNode(parent) && parent.typeArguments)
		{
			const args = parent.typeArguments;
			if (args.length > 0)
			{
				const paramNames: string[] = [];
				const seen = new Set<string>();
				for (let i = 0; i < args.length; i++)
				{
					const arg = args[i];
					const argText = arg.getText(arg.getSourceFile());
					const baseName = argText.replace(/\[\]$/, '').trim();
					if (/^[A-Z]$/.test(baseName) && !seen.has(baseName))
					{
						paramNames.push(baseName);
						seen.add(baseName);
					}
					else
					{
						paramNames.push(String.fromCharCode(75 + paramNames.length));
					}
				}

				return {
					params: `<${paramNames.join(', ')}>`,
					args: `<${paramNames.join(', ')}>`,
				};
			}
			break;
		}

		parent = parent.parent;
	}

	void aliasName;

	return null;
}

/**
 * The variable declaration a (possibly nested) binding element belongs to.
 */
function getBindingRootDeclaration(tsModule: typeof ts, element: ts.BindingElement): ts.VariableDeclaration | null
{
	let current: ts.Node = element.parent;

	while (tsModule.isObjectBindingPattern(current) || tsModule.isArrayBindingPattern(current) || tsModule.isBindingElement(current))
	{
		current = current.parent;
	}

	return tsModule.isVariableDeclaration(current) ? current : null;
}

/**
 * Every identifier a declaration name binds: the name itself, or all names of a destructuring pattern.
 */
function getBindingIdentifiers(tsModule: typeof ts, name: ts.BindingName): ts.Identifier[]
{
	if (tsModule.isIdentifier(name))
	{
		return [name];
	}

	const identifiers: ts.Identifier[] = [];
	for (const element of name.elements)
	{
		if (tsModule.isBindingElement(element))
		{
			identifiers.push(...getBindingIdentifiers(tsModule, element.name));
		}
	}

	return identifiers;
}

function getDeclarationNameNode(tsModule: typeof ts, decl: ts.Declaration): ts.Identifier | null
{
	if (tsModule.isClassDeclaration(decl) || tsModule.isFunctionDeclaration(decl))
	{
		return decl.name ?? null;
	}

	if (tsModule.isInterfaceDeclaration(decl) || tsModule.isTypeAliasDeclaration(decl) || tsModule.isEnumDeclaration(decl))
	{
		return decl.name;
	}

	return null;
}

function getEntityNameLeft(tsModule: typeof ts, name: ts.EntityName): ts.Identifier | null
{
	let current: ts.EntityName = name;

	while (tsModule.isQualifiedName(current))
	{
		current = current.left;
	}

	return tsModule.isIdentifier(current) ? current : null;
}

function getSymbolKey(symbol: TypeScriptSymbol): string
{
	const declarations = getDeclarations(symbol);
	if (declarations.length === 0)
	{
		return symbol.name;
	}

	const d = declarations[0];

	return `${d.getSourceFile().fileName}:${d.pos}:${d.end}`;
}

function getDeclarations(symbol: TypeScriptSymbol): ts.Declaration[]
{
	return symbol.declarations
		.map((handle) => handle.resolve())
		.filter((declaration) => declaration !== undefined);
}
