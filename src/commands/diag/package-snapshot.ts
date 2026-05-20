import { stripComments } from './analyzers/file-scanner';
import { parseJsFile, traverseShallow } from '../../utils/ast/parse-babel';

import type { BasePackage } from '../../modules/packages/base-package';

export type PackageSnapshot = {
	name: string;
	path: string;
	namespace: string;
	exportedGlobals: Set<string>;
	dependencies: string[];
	dependencyTreeSize: number;
	bundleSize: { js: number; css: number };
	assetsSize: number;
	totalSize: { js: number; css: number; assets: number };
	bundleConfig: Record<string, unknown>;
	importedExtensions: Set<string>;
	usedNamespaces: Set<string>;
};

export type SnapshotField = keyof Omit<PackageSnapshot, 'name' | 'path' | 'namespace'>;

export async function createSnapshot(
	extension: BasePackage,
	fields: Set<SnapshotField>,
): Promise<PackageSnapshot>
{
	const snapshot: PackageSnapshot = {
		name: extension.getName(),
		path: extension.getPath(),
		namespace: extension.getBundleConfig().get('namespace') ?? '',
		exportedGlobals: new Set(),
		dependencies: [],
		dependencyTreeSize: 0,
		bundleSize: { js: 0, css: 0 },
		assetsSize: 0,
		totalSize: { js: 0, css: 0, assets: 0 },
		bundleConfig: {},
		importedExtensions: new Set(),
		usedNamespaces: new Set(),
	};

	if (fields.has('dependencies') || fields.has('importedExtensions'))
	{
		const deps = await extension.getDependencies();
		snapshot.dependencies = deps.map((d) => d.name);
	}

	if (fields.has('dependencyTreeSize'))
	{
		const tree = await extension.getFlattedDependenciesTree(true);
		snapshot.dependencyTreeSize = tree.length;
	}

	if (fields.has('bundleSize') || fields.has('assetsSize'))
	{
		snapshot.bundleSize = extension.getBundlesSize();
	}

	if (fields.has('assetsSize'))
	{
		snapshot.assetsSize = extension.getAssetsSize();
	}

	if (fields.has('totalSize'))
	{
		snapshot.totalSize = await extension.getTotalTransferredSize();
	}

	if (fields.has('bundleConfig'))
	{
		const rawConfig = extension.getBundleConfig().getRawConfig();

		for (const [key, value] of Object.entries(rawConfig))
		{
			if (value !== undefined)
			{
				snapshot.bundleConfig[key] = value;
			}
		}
	}

	if (fields.has('exportedGlobals') || fields.has('importedExtensions'))
	{
		snapshot.exportedGlobals = await findExportedGlobals(extension);
	}

	if (fields.has('importedExtensions'))
	{
		const { imported, namespaces } = await findUsedExtensions(extension);
		snapshot.importedExtensions = imported;
		snapshot.usedNamespaces = namespaces;
	}

	return snapshot;
}

export async function findExportedGlobals(extension: BasePackage): Promise<Set<string>>
{
	const namespace = extension.getBundleConfig().get('namespace') ?? '';
	if (!namespace)
	{
		return new Set();
	}

	const { readFile } = await import('node:fs/promises');
	const exportNames = new Set<string>();

	for (const file of extension.getSourceFiles())
	{
		let content: string;
		try
		{
			content = await readFile(file, 'utf-8');
		}
		catch
		{
			continue;
		}

		collectExportsFromAst(content, file, namespace, exportNames);
	}

	// Note: the namespace object itself (e.g. `BX.UI`) is intentionally NOT added
	// here. Many Bitrix extensions share the same root namespace (`ui.buttons`,
	// `ui.notification`, `ui.viewer` all live under `BX.UI`); adding it as a
	// global would make every BX.UI.SomethingElse usage from a different
	// extension look like a usage of this one. Direct references to the bare
	// namespace via `Reflection.getClass('<namespace>')` are handled separately
	// by the analyzer using the extension's own namespace string.
	const globals = new Set<string>();
	for (const name of exportNames)
	{
		globals.add(`${namespace}.${name}`);
	}

	return globals;
}

/**
 * Extract names that become accessible on the extension's namespace at runtime.
 * Covers:
 *   - `export class/function/const/let/var Name`
 *   - `export { Foo, Bar as Baz }`
 *   - `Object.defineProperty(NS, 'X', ...)` — common lazy-singleton pattern
 *   - `NS.X = ...` — direct property assignment
 * where NS is either the literal namespace chain (`BX.UI.Notification`,
 * optionally prefixed with `window.` / `this.`) or a local alias.
 */
export function collectExportsFromAst(
	content: string,
	file: string,
	namespace: string,
	out: Set<string>,
): void
{
	const ast = parseJsFile(content, file);
	if (!ast)
	{
		return;
	}

	// Local aliases of the namespace object detected in this file
	// (e.g. `const ns = window.BX.UI.Notification`).
	const namespaceAliases = new Set<string>();

	traverseShallow(ast, {
		// Static exports
		ExportNamedDeclaration(path: any)
		{
			const decl = path.node.declaration;
			if (decl)
			{
				collectFromDeclaration(decl, out);
			}

			for (const spec of path.node.specifiers ?? [])
			{
				if (spec.type !== 'ExportSpecifier')
				{
					continue;
				}

				// `export { Foo as Bar }` — Bar is what becomes BX.NS.Bar
				const exportedName = identifierName(spec.exported);
				if (exportedName && /^[A-Z]/.test(exportedName))
				{
					out.add(exportedName);
				}
			}
		},

		// `const ns = window.BX.UI.Notification` etc.
		VariableDeclarator(path: any)
		{
			const id = path.node.id;
			const init = path.node.init;
			if (!id || id.type !== 'Identifier' || !init)
			{
				return;
			}

			if (matchesNamespaceTarget(init, namespace))
			{
				namespaceAliases.add(id.name);
			}
		},

		// Object.defineProperty(NS, 'X', ...) — lazy singletons
		CallExpression(path: any)
		{
			const callee = path.node.callee;
			if (callee.type !== 'MemberExpression' || callee.computed)
			{
				return;
			}

			if (callee.object?.name !== 'Object' || callee.property?.name !== 'defineProperty')
			{
				return;
			}

			const [target, key] = path.node.arguments;
			if (!target || !key)
			{
				return;
			}

			if (!isNamespaceTarget(target, namespace, namespaceAliases))
			{
				return;
			}

			const name = stringLiteralValue(key);
			if (name && /^[A-Z]/.test(name))
			{
				out.add(name);
			}
		},

		// NS.X = ... or NS.X.Y = ... (we only record top-level X)
		AssignmentExpression(path: any)
		{
			if (path.node.operator !== '=')
			{
				return;
			}

			const left = path.node.left;
			if (left.type !== 'MemberExpression' || left.computed)
			{
				return;
			}

			if (left.property?.type !== 'Identifier' || !/^[A-Z]/.test(left.property.name))
			{
				return;
			}

			if (isNamespaceTarget(left.object, namespace, namespaceAliases))
			{
				out.add(left.property.name);
			}
		},
	});
}

function collectFromDeclaration(decl: any, out: Set<string>): void
{
	if (decl.type === 'ClassDeclaration' || decl.type === 'FunctionDeclaration')
	{
		const name = identifierName(decl.id);
		if (name && /^[A-Z]/.test(name))
		{
			out.add(name);
		}

		return;
	}

	if (decl.type === 'VariableDeclaration')
	{
		for (const d of decl.declarations)
		{
			if (d.id?.type === 'Identifier' && /^[A-Z]/.test(d.id.name))
			{
				out.add(d.id.name);
			}
		}
	}
}

function identifierName(node: any): string | null
{
	if (!node)
	{
		return null;
	}

	if (node.type === 'Identifier')
	{
		return node.name;
	}

	if (node.type === 'StringLiteral')
	{
		return node.value;
	}

	return null;
}

function stringLiteralValue(node: any): string | null
{
	return node?.type === 'StringLiteral' ? node.value : null;
}

/**
 * True when `node` is the namespace object itself: either the literal chain
 * (with optional `window.` / `globalThis.` / `this.` prefix) or an identifier
 * that we've previously bound as an alias.
 */
function isNamespaceTarget(node: any, namespace: string, aliases: Set<string>): boolean
{
	if (!node)
	{
		return false;
	}

	if (node.type === 'Identifier' && aliases.has(node.name))
	{
		return true;
	}

	return matchesNamespaceTarget(node, namespace);
}

/**
 * Check whether a member expression chain equals the namespace, allowing for
 * `window.` / `globalThis.` / `this.` / `self.` roots.
 */
function matchesNamespaceTarget(node: any, namespace: string): boolean
{
	const chain = memberChainToString(node);
	if (!chain)
	{
		return false;
	}

	const targets = [
		namespace,
		`window.${namespace}`,
		`globalThis.${namespace}`,
		`self.${namespace}`,
		`this.${namespace}`,
	];

	return targets.includes(chain);
}

function memberChainToString(node: any): string | null
{
	if (!node)
	{
		return null;
	}

	// Peel TypeScript wrappers: `(x as T)` / `<T>x` / `x!`.
	if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion' || node.type === 'TSNonNullExpression')
	{
		return memberChainToString(node.expression);
	}

	// Parenthesized expression — babel exposes the inner node.
	if (node.type === 'ParenthesizedExpression')
	{
		return memberChainToString(node.expression);
	}

	if (node.type === 'Identifier')
	{
		return node.name;
	}

	if (node.type === 'ThisExpression')
	{
		return 'this';
	}

	if (node.type === 'MemberExpression' && !node.computed && node.property?.type === 'Identifier')
	{
		const obj = memberChainToString(node.object);
		if (!obj)
		{
			return null;
		}

		return `${obj}.${node.property.name}`;
	}

	return null;
}

type UsedExtensionsResult = {
	imported: Set<string>;
	namespaces: Set<string>;
};

async function findUsedExtensions(extension: BasePackage): Promise<UsedExtensionsResult>
{
	const { readFile } = await import('node:fs/promises');
	const imported = new Set<string>();
	const namespaces = new Set<string>();
	const sourceFiles = extension.getSourceFiles();

	for (const file of sourceFiles)
	{
		let content: string;
		try
		{
			content = await readFile(file, 'utf-8');
		}
		catch
		{
			continue;
		}

		// Strip comments to avoid false positives
		const code = stripComments(content);

		// import ... from 'extension.name' or import 'extension.name' (side-effect)
		const importPattern = /(?:from\s+|import\s+)['"]([a-z][a-z0-9._-]+)['"]/g;
		for (const match of code.matchAll(importPattern))
		{
			imported.add(match[1]);
		}

		// Note: BX.loadExtension / Runtime.loadExtension are NOT counted as usage.
		// They load extensions dynamically at runtime without declaring a dependency in config.php.

		// Reflection.getClass('BX.Namespace.Class') / Runtime.getClass('BX.Namespace.Class')
		const getClassPattern = /(?:Reflection|Runtime)\.getClass\(\s*['"]([A-Za-z0-9.]+)['"]\s*\)/g;
		for (const match of code.matchAll(getClassPattern))
		{
			namespaces.add(match[1]);
		}

		// BX.Namespace.Something — namespace usage
		const namespacePattern = /BX\.[A-Z][A-Za-z0-9]+(?:\.[A-Z][A-Za-z0-9]+)*/g;
		for (const match of code.matchAll(namespacePattern))
		{
			namespaces.add(match[0]);
		}
	}

	return { imported, namespaces };
}
