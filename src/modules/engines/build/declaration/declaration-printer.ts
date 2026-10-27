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
		? printAmbientModule(bundle, options.namespace)
		: printScript(bundle, options);

	if (parts.length === 0)
	{
		return '';
	}

	return `/* eslint-disable */\n${parts.join('\n\n')}\n`;
}

/**
 * The file is a module, so only the extension namespace reaches the global scope, through
 * `declare global`. Internal members and npm types stay private to the file: they collide
 * with nothing and cannot be referenced from outside.
 */
function printAmbientModule(bundle: DeclarationBundle, namespace: string): string[]
{
	// In a module file `declare module '...'` augments a module instead of declaring it,
	// so npm types become private namespaces and import types point at them.
	const npmNamespaces = new Map(
		bundle.npmModules.map((npmModule) => [npmModule.moduleName, getNpmNamespaceName(npmModule)]),
	);

	const render = (text: string): string => replaceNpmImports(convertIndentationToTabs(text), npmNamespaces);
	const renderMembers = (members: DeclarationMember[]): string[] => {
		return members.map((member) => render(member.text)).filter((text) => text.length > 0);
	};

	const publicMembers = renderMembers([
		...bundle.typeMembers.filter((member) => member.isPublic),
		...bundle.valueMembers.filter((member) => member.isPublic),
	]);

	if (publicMembers.length === 0)
	{
		return [];
	}

	const parts = [
		`declare global {\n${indentBody(`namespace ${namespace} {\n${indentBody(publicMembers.join('\n\n'))}\n}`)}\n}`,
		...renderMembers(bundle.typeMembers.filter((member) => !member.isPublic)),
		...renderMembers(bundle.valueMembers.filter((member) => !member.isPublic)).map((text) => addDeclareKeyword(text)),
	];

	for (const npmModule of bundle.npmModules)
	{
		const name = npmNamespaces.get(npmModule.moduleName);
		parts.push(`declare namespace ${name} {\n${indentBody(render(npmModule.body))}\n}`);
	}

	parts.push('export {};');

	return parts;
}

/**
 * Module declarations need a script file, where every top-level declaration is global.
 * Internal members are therefore declared in the extension namespace along with the public ones.
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
		const namespaceBody = members
			.map((member) => convertIndentationToTabs(member.text))
			.filter((text) => text.length > 0)
			.join('\n\n');

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

function addExportKeyword(rendered: string): string
{
	if (/^\s*export\s/.test(rendered)) return rendered;

	return `export ${rendered}`;
}

/**
 * Top-level values of a .d.ts must be declared with `declare`; it goes after the leading JSDoc.
 */
function addDeclareKeyword(rendered: string): string
{
	return rendered.replace(/^((?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*))*\s*)/, '$1declare ');
}

export function hasAnyStatements(bundle: DeclarationBundle): boolean
{
	return bundle.typeMembers.length > 0 || bundle.valueMembers.length > 0;
}
