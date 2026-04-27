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

export async function bundleDeclarations(options: DeclarationBundleOptions): Promise<DeclarationBundle | null>
{
	const { default: tsModule } = await import('typescript');

	const emitted = await emitSourceDeclarations(tsModule, options);
	if (!emitted)
	{
		return null;
	}

	const entryDtsPath = findEntryDeclarationPath(options.input, options.packageRoot, emitted.declarations);
	if (!entryDtsPath)
	{
		return null;
	}

	const dtsProgram = createDtsProgram(tsModule, emitted.declarations, entryDtsPath);
	const checker = dtsProgram.getTypeChecker();
	const entryFile = dtsProgram.getSourceFile(entryDtsPath);

	if (!entryFile)
	{
		return null;
	}

	const collector = new SymbolCollector(tsModule, dtsProgram, checker, {
		packageRoot: options.packageRoot,
		extensionName: options.extensionName ?? null,
		tsconfigPaths: options.compilerOptions?.paths as Record<string, string[]> | undefined,
		tsconfigBaseUrl: options.compilerOptions?.baseUrl as string | undefined,
		sourceImports: emitted.sourceImports,
	});
	const members = collector.collectFromEntry(entryFile, options.namespace);

	if (members.length === 0)
	{
		return null;
	}

	return splitMembers(tsModule, members, collector.getNpmModules());
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
			if (member)
			{
				this.#result.push(member);
				this.#collectReferencedSymbols(decl);
			}
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

		const ts = this.#ts;
		cached = new Set<string>();

		for (const stmt of source.statements)
		{
			const spec = getTopLevelModuleSpecifier(ts, stmt);
			if (!spec) continue;
			if (spec.startsWith('.')) continue;
			if (isSiblingExtensionName(spec)) continue;
			const pkg = normalizeNpmPackageName(spec);
			if (pkg) cached.add(pkg);
		}

		this.#siblingNpmOwnership.set(siblingName, cached);

		return cached;
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
		rootDir: packageRoot,
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
	program.emit();

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

	return declarations.size > 0 ? { declarations, sourceImports } : null;
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

function findEntryDeclarationPath(input: string, packageRoot: string, declarations: Map<string, string>): string | null
{
	const outDir = path.join(packageRoot, 'dist');
	const sourceExtRe = /\.(?:tsx?|mts|cts|jsx?|mjs|cjs)$/;
	const relative = path.relative(packageRoot, input).replace(sourceExtRe, '.d.ts');
	const expected = path.normalize(path.join(outDir, relative));

	if (declarations.has(expected))
	{
		return expected;
	}

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
