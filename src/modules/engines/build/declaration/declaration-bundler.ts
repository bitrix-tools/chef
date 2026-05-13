import path from 'node:path';
import fs from 'node:fs';

import type ts from 'typescript';

import { PackageResolver } from '../../../packages/package-resolver';

export interface DeclarationBundleOptions
{
	packageRoot: string;
	input: string;
	namespace: string;
	extensionName?: string;
	compilerOptions?: ts.CompilerOptions;
}

export interface DeclarationBundle
{
	ts: typeof ts;
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
	const { default: tsModule } = await import('typescript');

	const emitted = await emitSourceDeclarations(tsModule, options);
	if (!emitted)
	{
		return { bundle: null, diagnostics: [] };
	}

	const diagnostics = emitted.diagnostics;

	const entryDtsPath = findEntryDeclarationPath(
		options.input,
		options.packageRoot,
		emitted.commonSourceDirectory,
		emitted.declarations,
	);

	if (!entryDtsPath)
	{
		return { bundle: null, diagnostics };
	}

	const dtsProgram = createDtsProgram(tsModule, emitted.declarations, entryDtsPath, emitted.sourceToDts);
	const checker = dtsProgram.getTypeChecker();
	const entryFile = dtsProgram.getSourceFile(entryDtsPath);

	if (!entryFile)
	{
		return { bundle: null, diagnostics };
	}

	const collector = new SymbolCollector(tsModule, dtsProgram, checker, {
		packageRoot: options.packageRoot,
		extensionName: options.extensionName ?? null,
		tsconfigPaths: options.compilerOptions?.paths as Record<string, string[]> | undefined,
		tsconfigBaseUrl: options.compilerOptions?.baseUrl as string | undefined,
		sourceImports: emitted.sourceImports,
		sourceToDts: emitted.sourceToDts,
	});
	const members = collector.collectFromEntry(entryFile, options.namespace);

	if (members.length === 0)
	{
		return { bundle: null, diagnostics };
	}

	const inlineDetections = collector.detectInlinedSiblingTypes();
	const inlineDiagnostics = inlineDetections.map((detection): DeclarationDiagnostic => ({
		code: 0,
		message: (
			`Export "${detection.exportName}" inlines the shape of `
			+ `"${detection.symbolName}" from sibling extension "${detection.siblingName}" `
			+ `into the .d.ts. Add an explicit type annotation to keep the namespace reference `
			+ `(e.g. \`: typeof ${detection.symbolName}\`) — otherwise consumers will see the `
			+ `full structure instead of \`${detection.siblingName}.${detection.symbolName}\`.`
		),
		severity: 'warning',
		file: options.input,
		line: null,
		column: null,
	}));

	return {
		bundle: splitMembers(tsModule, members, collector.getNpmModules()),
		diagnostics: [...diagnostics, ...inlineDiagnostics],
	};
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
	tsconfigBaseUrl?: string;
	sourceImports?: Set<string>;
	sourceToDts?: Map<string, string>;
}

interface NpmPackageBuffer
{
	statements: string[];
	seenSymbolKeys: Set<string>;
}

class SymbolCollector
{
	readonly #ts: typeof ts;
	readonly #program: ts.Program;
	readonly #checker: ts.TypeChecker;
	readonly #seen = new Set<string>();
	readonly #seenSourceDecls = new Set<ts.Node>();
	readonly #result: CollectedMember[] = [];
	readonly #visitingSymbols = new Set<ts.Symbol>();
	readonly #siblingReplacements = new Map<ts.Symbol, string>();
	readonly #siblingNamespaces = new Map<ts.Symbol, string>();
	readonly #options: SymbolCollectorOptions;
	readonly #npmPackages = new Map<string, NpmPackageBuffer>();
	readonly #npmReplacements = new Map<ts.Symbol, string>();
	/** Maps a symbol originating from an npm package to that package's internal module name. */
	readonly #npmPackageOfSymbol = new Map<ts.Symbol, string>();
	/** Cache: siblingName → set of npm package names it re-exports from its own entry. */
	readonly #siblingNpmOwnership = new Map<string, Set<string>>();
	/** Sibling extensions whose entry we've seen imported by the current bundle. */
	readonly #importedSiblings = new Map<string, ts.SourceFile | null>();
	#currentNamespace = '';

	constructor(tsModule: typeof ts, program: ts.Program, checker: ts.TypeChecker, options: SymbolCollectorOptions)
	{
		this.#ts = tsModule;
		this.#program = program;
		this.#checker = checker;
		this.#options = options;
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

		const moduleSymbol = this.#checker.getSymbolAtLocation(entryFile);
		if (!moduleSymbol)
		{
			return [];
		}

		// Register sibling extensions up-front from the original source-file imports
		// (which the declaration emit may have stripped). This lets later npm detection
		// check sibling ownership even if a specific npm symbol never flows through a
		// sibling-aliased identifier in the emitted dts.
		this.#registerSiblingsFromSourceImports();

		const exports = this.#checker.getExportsOfModule(moduleSymbol);

		for (const exportSymbol of exports)
		{
			this.#collectExportSymbol(exportSymbol, exportSymbol.name);
		}

		this.#applyCollectedReplacements(namespace);

		return this.#result;
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
					const detection = this.#matchSiblingShape(node, siblingDtsToName, member.name);
					if (detection)
					{
						const key = `${detection.exportName}:${detection.siblingName}:${detection.symbolName}`;
						if (!seenKeys.has(key))
						{
							seenKeys.add(key);
							detections.push(detection);
						}

						return;
					}
				}

				ts.forEachChild(node, visit);
			};

			visit(member.sourceDecl);
		}

		return detections;
	}

	#matchSiblingShape(
		node: ts.TypeLiteralNode,
		siblingDtsToName: Map<ts.SourceFile, string>,
		exportName: string | null,
	): InlinedSiblingDetection | null
	{
		const type = this.#checker.getTypeAtLocation(node);

		// Direct symbol match: works when the literal is e.g. `IconClass` (named class
		// declaration) — the symbol's declarations point at the sibling .d.ts file.
		const symbol = type.aliasSymbol ?? type.symbol;
		if (symbol)
		{
			const decls = symbol.getDeclarations() ?? [];
			for (const decl of decls)
			{
				const siblingName = siblingDtsToName.get(decl.getSourceFile());
				if (siblingName)
				{
					return {
						exportName: exportName ?? '<anonymous>',
						siblingName,
						symbolName: symbol.name,
					};
				}
			}
		}

		// Anonymous object types (e.g. `as const` exports like `Outline`) inline into a
		// new `__type` symbol pointing at our own file, losing the link to the sibling.
		// Match by structural identity instead: precompute the type of each top-level
		// export of every imported sibling and compare with TypeChecker.
		return this.#matchAnonymousAgainstSiblingExports(type, siblingDtsToName, exportName);
	}

	#siblingExportTypes: Array<{ type: ts.Type; siblingName: string; symbolName: string }> | null = null;

	#getSiblingExportTypes(siblingDtsToName: Map<ts.SourceFile, string>): Array<{ type: ts.Type; siblingName: string; symbolName: string }>
	{
		if (this.#siblingExportTypes) return this.#siblingExportTypes;

		const result: Array<{ type: ts.Type; siblingName: string; symbolName: string }> = [];
		const visited = new Set<ts.SourceFile>();
		const seenSymbols = new Set<ts.Symbol>();

		const ts = this.#ts;

		const collect = (dtsFile: ts.SourceFile, siblingName: string): void => {
			if (visited.has(dtsFile)) return;
			visited.add(dtsFile);

			const moduleSymbol = this.#checker.getSymbolAtLocation(dtsFile);
			if (moduleSymbol)
			{
				const exports = this.#checker.getExportsOfModule(moduleSymbol);
				for (const exportSymbol of exports)
				{
					if (seenSymbols.has(exportSymbol)) continue;
					seenSymbols.add(exportSymbol);

					const decls = exportSymbol.getDeclarations() ?? [];
					if (decls.length === 0) continue;

					const type = this.#checker.getTypeOfSymbolAtLocation(exportSymbol, decls[0]);
					// Skip primitive / trivially-named types — matching them is too prone to
					// false positives (e.g. `any`, `string`, simple unions).
					const flags = type.getFlags();
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
	#isStructurallyEmpty(type: ts.Type): boolean
	{
		const ts = this.#ts;

		if (type.isUnionOrIntersection())
		{
			return type.types.every((part) => this.#isStructurallyEmpty(part));
		}

		if (this.#checker.getPropertiesOfType(type).length > 0) return false;
		if (type.getCallSignatures().length > 0) return false;
		if (type.getConstructSignatures().length > 0) return false;

		const checker = this.#checker as unknown as {
			getIndexInfosOfType?: (type: ts.Type) => ReadonlyArray<unknown>;
		};
		if (typeof checker.getIndexInfosOfType === 'function')
		{
			if (checker.getIndexInfosOfType(type).length > 0) return false;
		}
		else
		{
			if (this.#checker.getIndexTypeOfType(type, ts.IndexKind.String)) return false;
			if (this.#checker.getIndexTypeOfType(type, ts.IndexKind.Number)) return false;
		}

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
		type: ts.Type,
		siblingDtsToName: Map<ts.SourceFile, string>,
		exportName: string | null,
	): InlinedSiblingDetection | null
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
		const checker = this.#checker as unknown as {
			isTypeAssignableTo?: (a: ts.Type, b: ts.Type) => boolean;
		};

		if (typeof checker.isTypeAssignableTo !== 'function') return null;

		for (const candidate of candidates)
		{
			if (checker.isTypeAssignableTo(type, candidate.type) && checker.isTypeAssignableTo(candidate.type, type))
			{
				return {
					exportName: exportName ?? '<anonymous>',
					siblingName: candidate.siblingName,
					symbolName: candidate.symbolName,
				};
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

	#collectNamespaceMemberSymbols(): Set<ts.Symbol>
	{
		const ts = this.#ts;
		const result = new Set<ts.Symbol>();

		for (const member of this.#result)
		{
			if (member.kind !== 'namespaceMember' || !member.sourceDecl) continue;

			const decl = member.sourceDecl;
			let nameNode: ts.Identifier | null = null;

			if (ts.isClassDeclaration(decl) || ts.isFunctionDeclaration(decl))
			{
				nameNode = decl.name ?? null;
			}
			else if (ts.isEnumDeclaration(decl))
			{
				nameNode = decl.name;
			}
			else if (ts.isVariableStatement(decl))
			{
				const first = decl.declarationList.declarations[0];
				if (first && ts.isIdentifier(first.name)) nameNode = first.name;
			}

			if (nameNode)
			{
				const sym = this.#checker.getSymbolAtLocation(nameNode);
				if (sym) result.add(sym);
			}
		}

		return result;
	}

	#findNamespaceQualificationEdits(
		decl: ts.Node,
		textStart: number,
		namespaceMemberSymbols: Set<ts.Symbol>,
		namespace: string,
	): Array<{ start: number; end: number; replacement: string }>
	{
		const ts = this.#ts;
		const edits: Array<{ start: number; end: number; replacement: string }> = [];
		const sourceFile = decl.getSourceFile();

		const visit = (node: ts.Node): void => {
			if (ts.isIdentifier(node) && this.#isReferencePosition(node))
			{
				const symbol = this.#checker.getSymbolAtLocation(node);
				const resolved = symbol ? (this.#resolveAliasDeep(symbol) ?? symbol) : null;
				if (resolved && namespaceMemberSymbols.has(resolved))
				{
					const nodeStart = node.getStart(sourceFile, false) - textStart;
					const nodeEnd = node.getEnd() - textStart;
					edits.push({ start: nodeStart, end: nodeEnd, replacement: `${namespace}.${node.text}` });
				}
			}

			ts.forEachChild(node, visit);
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
				const symbol = this.#checker.getSymbolAtLocation(node);
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

			ts.forEachChild(node, visit);
		};

		visit(decl);

		return edits;
	}

	#buildLocalImportTypeEdit(
		node: ts.ImportTypeNode,
		resolved: ts.Symbol,
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
		const declarations = resolved.getDeclarations() ?? [];
		if (declarations.length === 0) return null;

		const isLocal = declarations.some((d) => {
			const src = d.getSourceFile();
			if (src.fileName.includes('node_modules')) return false;
			if (isBuiltinLibFile(src)) return false;

			return this.#program.getSourceFile(src.fileName) === src;
		});
		if (!isLocal) return null;

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

	#hasCollectedMember(symbol: ts.Symbol): boolean
	{
		const key = `:${getSymbolKey(symbol)}`;
		for (const seenKey of this.#seen)
		{
			if (seenKey.endsWith(key)) return true;
		}

		return false;
	}

	#findCollectedMember(symbol: ts.Symbol): CollectedMember | null
	{
		const ts = this.#ts;
		const declarations = symbol.getDeclarations() ?? [];
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

		const symbol = this.#checker.getSymbolAtLocation(qualifierLeft);
		if (!symbol) return null;

		const resolved = this.#resolveAliasDeep(symbol) ?? symbol;

		// The "head" of an ImportTypeNode is the part before type arguments:
		// `import("pkg").QualifierPath` — everything up to `<` (or the end of node if no `<`).
		const headStart = node.getStart(sourceFile, false) - textStart;
		const headEnd = node.typeArguments && node.typeArguments.length > 0
			? (node.typeArguments.pos - 1) - textStart // position of '<'
			: node.getEnd() - textStart;
		const qualifierText = node.qualifier.getText(sourceFile);

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

	#collectExportSymbol(symbol: ts.Symbol, publicName: string): void
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

		const declarations = resolved.getDeclarations() ?? [];

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

	#buildMemberFromDeclaration(decl: ts.Declaration, publicName: string, _symbol: ts.Symbol): CollectedMember | null
	{
		const ts = this.#ts;

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

			ts.forEachChild(node, visit);
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
		const symbol = this.#checker.getSymbolAtLocation(node);
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

		const declarations = resolved.getDeclarations() ?? [];
		if (declarations.length === 0)
		{
			if (nodeName)
			{
				this.#collectBuiltinAlias(symbol, nodeName, node);
			}

			return;
		}

		const isBuiltin = declarations.some((d) => isBuiltinLibFile(d.getSourceFile()));

		if (isBuiltin)
		{
			if (nodeName && symbol.name !== resolved.name)
			{
				this.#collectBuiltinAlias(symbol, nodeName, node);
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

		const name = this.#extractDeclarationName(resolved, declarations);
		if (!name)
		{
			return;
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

	#tryRegisterNpmPackage(symbol: ts.Symbol, resolved: ts.Symbol, nodeName: string, declarations: readonly ts.Declaration[]): void
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
			if (isBuiltinLibFile(src)) continue;

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

	#inlineNpmDeclarations(symbol: ts.Symbol, buffer: NpmPackageBuffer, publicName: string): void
	{
		const ts = this.#ts;
		const declarations = symbol.getDeclarations() ?? [];
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

			ts.forEachChild(node, visit);
		};

		visit(decl);
	}

	#tryInlineReferencedNpmSymbol(node: ts.Identifier, buffer: NpmPackageBuffer): void
	{
		const ts = this.#ts;
		const symbol = this.#checker.getSymbolAtLocation(node);
		if (!symbol) return;

		const resolved = this.#resolveAliasDeep(symbol) ?? symbol;
		const declarations = resolved.getDeclarations() ?? [];
		if (declarations.length === 0) return;

		const isBuiltin = declarations.some((d) => isBuiltinLibFile(d.getSourceFile()));
		if (isBuiltin) return;

		// Only inline if symbol lives in node_modules (even across packages — we duplicate everything).
		const allInNodeModules = declarations.every((d) => d.getSourceFile().fileName.includes('node_modules'));
		if (!allInNodeModules) return;

		const name = resolved.name && resolved.name !== 'default' ? resolved.name : node.text;
		this.#inlineNpmDeclarations(resolved, buffer, name);
	}

	#tryRegisterSiblingExtension(symbol: ts.Symbol): boolean
	{
		const ts = this.#ts;

		if ((symbol.flags & ts.SymbolFlags.Alias) === 0)
		{
			return false;
		}

		const decls = symbol.getDeclarations();
		if (!decls || decls.length === 0) return false;

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

		const baseUrl = this.#options.tsconfigBaseUrl ?? this.#options.packageRoot;
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

				return ts.createSourceFile(absolute, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
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
		const ts = this.#ts;
		const compilerOptions = this.#program.getCompilerOptions();

		const result = ts.resolveModuleName(
			moduleSpecifier,
			containingFile,
			compilerOptions,
			ts.sys,
		);

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
			? ts.ScriptKind.TS
			: ts.ScriptKind.JS;

		return ts.createSourceFile(fileName, text, ts.ScriptTarget.ESNext, true, scriptKind);
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

	#collectBuiltinAlias(originalSymbol: ts.Symbol, aliasName: string, referenceNode: ts.Node): void
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

		const key = `${aliasName}:builtin:${targetName}`;
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

	#extractDeclarationName(symbol: ts.Symbol, declarations: readonly ts.Declaration[]): string | null
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

	#resolveAliasDeep(symbol: ts.Symbol): ts.Symbol | null
	{
		const ts = this.#ts;
		const SymbolFlags = ts.SymbolFlags;

		let current: ts.Symbol | undefined = symbol;
		const seen = new Set<ts.Symbol>();

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

function splitMembers(tsModule: typeof ts, members: CollectedMember[], npmModules: NpmModule[]): DeclarationBundle
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
		ts: tsModule,
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

	const jsdocStart = findJsDocStart(tsModule, statement);
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

function findJsDocStart(tsModule: typeof ts, node: ts.Node): number | null
{
	const nodeWithJsdoc = node as unknown as { jsDoc?: ts.JSDoc[] };
	const jsdocs = nodeWithJsdoc.jsDoc;
	if (jsdocs && jsdocs.length > 0)
	{
		return jsdocs[0].getStart(node.getSourceFile(), false);
	}

	void tsModule;

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
	commonSourceDirectory: string;
	/** Maps original .ts source file path → emitted .d.ts path inside `declarations`. */
	sourceToDts: Map<string, string>;
	diagnostics: DeclarationDiagnostic[];
}

export interface DeclarationDiagnostic
{
	code: number;
	message: string;
	severity: 'error' | 'warning';
	file: string | null;
	line: number | null;
	column: number | null;
}

export interface InlinedSiblingDetection
{
	exportName: string;
	siblingName: string;
	symbolName: string;
}

async function emitSourceDeclarations(
	tsModule: typeof ts,
	options: DeclarationBundleOptions,
): Promise<EmitResult | null>
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

	const compilerOptions: ts.CompilerOptions = {
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
		// to `host.writeFile`, which we override to capture into an in-memory
		// Map below. Nothing is written to disk here — the user's actual
		// `bundle.config.output` is honoured separately by the `DeclarationEmitter`
		// facade, which writes the final bundled .d.ts next to the .js bundle.
		// `<packageRoot>/dist` is just a stable virtual namespace.
		outDir: path.join(packageRoot, 'dist'),
		noEmitOnError: false,
	};

	const host = tsModule.createCompilerHost(compilerOptions, true);
	const declarations = new Map<string, string>();

	host.writeFile = (fileName: string, text: string) => {
		if (fileName.endsWith('.d.ts'))
		{
			declarations.set(path.normalize(fileName), text);
		}
	};

	host.resolveModuleNameLiterals = (moduleLiterals, containingFile) => {
		return moduleLiterals.map((literal) => {
			const moduleName = literal.text;
			const resolution = tsModule.resolveModuleName(moduleName, containingFile, compilerOptions, host);
			const resolved = resolution.resolvedModule;

			if (!resolved) return { resolvedModule: undefined };

			if (resolved.extension === tsModule.Extension.Js && resolved.isExternalLibraryImport)
			{
				const patched = resolveNpmTypesFallback(tsModule, resolved.resolvedFileName, resolved.packageId?.name);
				if (patched)
				{
					return {
						resolvedModule: {
							...resolved,
							resolvedFileName: patched,
							extension: tsModule.Extension.Dts,
						},
					};
				}
			}

			return { resolvedModule: resolved };
		});
	};

	const program = tsModule.createProgram(rootNames, compilerOptions, host);
	const emitResult = program.emit();

	const ownSourceFiles = new Set(rootNames.map((name) => path.normalize(name)));
	const diagnostics = collectOwnDiagnostics(tsModule, program, emitResult, ownSourceFiles);

	// Collect module specifiers from source files so we know about sibling imports,
	// even when TS strips them during declaration emit.
	const sourceImports = new Set<string>();
	for (const rootName of rootNames)
	{
		const src = program.getSourceFile(rootName);
		if (!src) continue;
		for (const stmt of src.statements)
		{
			const spec = getTopLevelModuleSpecifier(tsModule, stmt);
			if (spec) sourceImports.add(spec);
		}
	}

	// `getCommonSourceDirectory` is internal API, not on the public Program type.
	const commonSourceDirectory = (program as unknown as { getCommonSourceDirectory(): string })
		.getCommonSourceDirectory();

	// Build source-to-dts mapping: for each input .ts file, compute where TS would emit
	// the corresponding .d.ts. This lets the secondary dts program resolve `import`
	// paths that are written relative to the original source location.
	const sourceToDts = new Map<string, string>();
	for (const sourceFile of program.getSourceFiles())
	{
		if (sourceFile.isDeclarationFile) continue;
		const fileName = sourceFile.fileName;
		if (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx') && !fileName.endsWith('.mts') && !fileName.endsWith('.cts')) continue;

		const relative = path.relative(commonSourceDirectory, fileName);
		if (relative.startsWith('..')) continue;

		const dtsRelative = relative.replace(/\.(?:tsx?|mts|cts)$/, '.d.ts');
		const dtsPath = path.normalize(path.join(compilerOptions.outDir!, dtsRelative));

		if (declarations.has(dtsPath))
		{
			sourceToDts.set(path.normalize(fileName), dtsPath);
		}
	}

	if (declarations.size === 0 && diagnostics.length === 0)
	{
		return null;
	}

	return { declarations, sourceImports, commonSourceDirectory, sourceToDts, diagnostics };
}

function collectOwnDiagnostics(
	tsModule: typeof ts,
	_program: ts.Program,
	emitResult: ts.EmitResult,
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
	for (const diagnostic of emitResult.diagnostics)
	{
		const file = diagnostic.file;
		if (!file) continue;
		if (!ownSourceFiles.has(path.normalize(file.fileName))) continue;

		const start = diagnostic.start ?? 0;
		const { line, character } = file.getLineAndCharacterOfPosition(start);
		const message = tsModule.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
		const severity = diagnostic.category === tsModule.DiagnosticCategory.Error ? 'error' : 'warning';

		const key = `${file.fileName}:${line}:${character}:${diagnostic.code}:${message}`;
		if (seen.has(key)) continue;
		seen.add(key);

		result.push({
			code: diagnostic.code,
			message,
			severity,
			file: file.fileName,
			line: line + 1,
			column: character + 1,
		});
	}

	return result;
}

function resolveNpmTypesFallback(tsModule: typeof ts, jsFilePath: string, packageName: string | undefined): string | null
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

	void tsModule;

	return null;
}

function findEntryDeclarationPath(
	input: string,
	packageRoot: string,
	commonSourceDirectory: string,
	declarations: Map<string, string>,
): string | null
{
	const outDir = path.join(packageRoot, 'dist');
	const sourceExtRe = /\.(?:tsx?|mts|cts|jsx?|mjs|cjs)$/;

	// TS emits files at `outDir/<path-relative-to-commonSourceDirectory>/<file>.d.ts`.
	// When `rootDir` is not set, TS infers `commonSourceDirectory` from all input files
	// (the deepest common ancestor). For `main.core.minimal` whose entry imports from
	// `../../src/lib/...`, this becomes the parent extension's root, not the minimal's.
	const relative = path.relative(commonSourceDirectory, input).replace(sourceExtRe, '.d.ts');
	const expected = path.normalize(path.join(outDir, relative));

	if (declarations.has(expected))
	{
		return expected;
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

function createDtsProgram(
	tsModule: typeof ts,
	declarations: Map<string, string>,
	_entryPath: string,
	sourceToDts: Map<string, string>,
): ts.Program
{
	const compilerOptions: ts.CompilerOptions = {
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

	const sources = new Map<string, ts.SourceFile>();
	for (const [fileName, text] of declarations)
	{
		const source = tsModule.createSourceFile(
			fileName,
			text,
			tsModule.ScriptTarget.ESNext,
			true,
			tsModule.ScriptKind.TS,
		);
		sources.set(path.normalize(fileName), source);
	}

	const defaultHost = tsModule.createCompilerHost(compilerOptions, true);

	const host: ts.CompilerHost = {
		...defaultHost,
		getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
			const normalized = path.normalize(fileName);
			if (sources.has(normalized))
			{
				return sources.get(normalized);
			}

			return defaultHost.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
		},
		fileExists: (fileName) => {
			const normalized = path.normalize(fileName);
			if (sources.has(normalized))
			{
				return true;
			}

			return defaultHost.fileExists(fileName);
		},
		readFile: (fileName) => {
			const normalized = path.normalize(fileName);
			const source = sources.get(normalized);
			if (source)
			{
				return source.text;
			}

			return defaultHost.readFile(fileName);
		},
		writeFile: () => {},
		resolveModuleNameLiterals: (moduleLiterals, containingFile) => {
			return moduleLiterals.map((literal) => {
				const moduleName = literal.text;
				if (!moduleName.startsWith('.'))
				{
					const fallback = tsModule.resolveModuleName(
						moduleName,
						containingFile,
						compilerOptions,
						defaultHost,
					);
					const resolved = fallback.resolvedModule;

					if (resolved && resolved.extension === tsModule.Extension.Js && resolved.isExternalLibraryImport)
					{
						const patched = resolveNpmTypesFallback(tsModule, resolved.resolvedFileName, resolved.packageId?.name);
						if (patched)
						{
							return {
								resolvedModule: {
									...resolved,
									resolvedFileName: patched,
									extension: tsModule.Extension.Dts,
								},
							};
						}
					}

					return { resolvedModule: resolved };
				}

				const containingDir = path.dirname(containingFile);
				const baseResolved = path.resolve(containingDir, moduleName);

				const candidates = [
					baseResolved + '.d.ts',
					baseResolved + '.ts',
					path.join(baseResolved, 'index.d.ts'),
					path.join(baseResolved, 'index.ts'),
				];

				// First pass: direct lookup in our in-memory dts map.
				for (const candidate of candidates)
				{
					const normalized = path.normalize(candidate);
					if (sources.has(normalized))
					{
						return {
							resolvedModule: {
								resolvedFileName: normalized,
								extension: tsModule.Extension.Dts,
								isExternalLibraryImport: false,
							},
						};
					}
				}

				// Second pass: the path the import is written against may correspond
				// to the *original* source location (TS emits relative paths from the
				// source file's perspective). Check if any candidate maps via
				// sourceToDts to an emitted .d.ts that we have in memory.
				for (const candidate of candidates)
				{
					const normalized = path.normalize(candidate);
					const dtsPath = sourceToDts.get(normalized);
					if (dtsPath && sources.has(dtsPath))
					{
						return {
							resolvedModule: {
								resolvedFileName: dtsPath,
								extension: tsModule.Extension.Dts,
								isExternalLibraryImport: false,
							},
						};
					}
				}

				return { resolvedModule: undefined };
			});
		},
	};

	return tsModule.createProgram({
		rootNames: [...sources.keys()],
		options: compilerOptions,
		host,
	});
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

function isBuiltinLibFile(src: ts.SourceFile): boolean
{
	if (src.hasNoDefaultLib) return true;

	const fileName = src.fileName;

	return fileName.includes('typescript/lib/lib.')
		|| fileName.includes('node_modules/@types/node/');
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

function getSymbolKey(symbol: ts.Symbol): string
{
	const declarations = symbol.getDeclarations() ?? [];
	if (declarations.length === 0)
	{
		return symbol.name;
	}

	const d = declarations[0];

	return `${d.getSourceFile().fileName}:${d.pos}:${d.end}`;
}
