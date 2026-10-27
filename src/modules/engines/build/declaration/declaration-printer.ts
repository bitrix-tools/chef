import type { DeclarationBundle, DeclarationMember, NpmModule } from './declaration-bundler';

export type DeclarationMode = 'ambient' | 'module' | 'both';

export interface PrintOptions
{
	mode: DeclarationMode;
	namespace: string;
	moduleName?: string;
}

export function printBundle(bundle: DeclarationBundle, options: PrintOptions): string
{
	const parts = options.mode === 'ambient'
		? printAmbientNamespace(bundle, options.namespace)
		: printScript(bundle, options);

	if (parts.length === 0)
	{
		return '';
	}

	return `/* eslint-disable */\n${parts.join('\n\n')}\n`;
}

/**
 * Only the extension namespace is declared globally. Members are exported explicitly, so
 * internal members and npm types stay private to the namespace block: they collide with
 * nothing and cannot be referenced from outside.
 */
function printAmbientNamespace(bundle: DeclarationBundle, namespace: string): string[]
{
	// `declare module '...'` would make npm types global, so they become private namespaces
	// and import types point at them.
	const npmNamespaces = new Map(
		bundle.npmModules.map((npmModule) => [npmModule.moduleName, getNpmNamespaceName(npmModule)]),
	);

	const render = (text: string): string => replaceNpmImports(convertIndentationToTabs(text), npmNamespaces);
	const npmParts = bundle.npmModules.map((npmModule) => {
		return `namespace ${npmNamespaces.get(npmModule.moduleName)} {\n${indentBody(render(npmModule.body))}\n}`;
	});

	const body = printNamespaceBody(bundle, render, npmParts);
	if (body.length === 0)
	{
		return [];
	}

	return [`declare namespace ${namespace} {\n${indentBody(body)}\n}`];
}

/**
 * Module declarations need a script file, where every top-level declaration is global.
 * npm types are therefore declared as modules, and the extension namespace keeps its
 * internal members private the same way as in the ambient mode.
 */
function printScript(bundle: DeclarationBundle, options: PrintOptions): string[]
{
	const parts: string[] = [];
	const members = [...bundle.typeMembers, ...bundle.valueMembers];

	for (const npmModule of bundle.npmModules)
	{
		const body = convertIndentationToTabs(npmModule.body);
		parts.push(`declare module '${npmModule.moduleName}' {\n${indentBody(body)}\n}`);
	}

	if (options.mode === 'both')
	{
		const namespaceBody = printNamespaceBody(bundle, convertIndentationToTabs);
		if (namespaceBody.length > 0)
		{
			parts.push(`declare namespace ${options.namespace} {\n${indentBody(namespaceBody)}\n}`);
		}
	}

	if (options.moduleName)
	{
		const moduleBody = members
			.map((member) => addExportKeyword(convertIndentationToTabs(member.textUnqualified ?? member.text)))
			.join('\n\n');

		if (moduleBody.length > 0)
		{
			parts.push(`declare module '${options.moduleName}' {\n${indentBody(moduleBody)}\n}`);
		}
	}

	return parts;
}

/**
 * Public members are exported. Once a namespace block has an explicit export, the members
 * without one are not exported, so `export {};` closes the block when it has private members.
 */
function printNamespaceBody(
	bundle: DeclarationBundle,
	render: (text: string) => string,
	privateParts: string[] = [],
): string
{
	const members = [...bundle.typeMembers, ...bundle.valueMembers];
	const renderMembers = (selected: DeclarationMember[]): string[] => {
		return selected.map((member) => render(member.text)).filter((text) => text.length > 0);
	};

	const publicMembers = renderMembers(members.filter((member) => member.isPublic)).map(addExportKeyword);
	if (publicMembers.length === 0)
	{
		return '';
	}

	const internalParts = [
		...renderMembers(members.filter((member) => !member.isPublic)),
		...privateParts,
	];

	if (internalParts.length === 0)
	{
		return publicMembers.join('\n\n');
	}

	return [...publicMembers, ...internalParts, 'export {};'].join('\n\n');
}

function getNpmNamespaceName(npmModule: NpmModule): string
{
	return `npm$${npmModule.packageName.replace(/^@/, '').replace(/[^\w$]/g, '_')}`;
}

function replaceNpmImports(text: string, npmNamespaces: Map<string, string>): string
{
	let result = text;
	for (const [moduleName, namespaceName] of npmNamespaces)
	{
		result = result.replaceAll(`import('${moduleName}')`, namespaceName);
	}

	return result;
}

function indentBody(body: string): string
{
	return body
		.split('\n')
		.map((line) => (line.length > 0 ? `\t${line}` : line))
		.join('\n');
}

function convertIndentationToTabs(text: string): string
{
	return text.replace(/^( {4})+/gm, (match) => '\t'.repeat(match.length / 4));
}

/**
 * `export` goes after the leading JSDoc, so the comment still documents the declaration.
 */
function addExportKeyword(rendered: string): string
{
	const [comments] = /^(?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*))*\s*/.exec(rendered);
	const declaration = rendered.slice(comments.length);
	if (/^export\s/.test(declaration)) return rendered;

	return `${comments}export ${declaration}`;
}

export function hasAnyStatements(bundle: DeclarationBundle): boolean
{
	return bundle.typeMembers.length > 0 || bundle.valueMembers.length > 0;
}
