import type { LaidOutBundle } from './declaration-layout';

export type DeclarationMode = 'ambient' | 'module' | 'both';

export interface PrintOptions
{
	mode: DeclarationMode;
	moduleName?: string;
}

export function printBundle(bundle: LaidOutBundle, options: PrintOptions): string
{
	const parts: string[] = [];
	const mode = options.mode;

	for (const npmModule of bundle.npmModules)
	{
		const body = convertIndentationToTabs(npmModule.body);
		const indented = indentBody(body);
		parts.push(`declare module '${npmModule.moduleName}' {\n${indented}\n}`);
	}

	if (mode === 'ambient' || mode === 'both')
	{
		const topLevel = bundle.topLevelMembers
			.map((m) => convertIndentationToTabs(m.text))
			.filter((text) => text.length > 0);

		if (topLevel.length > 0)
		{
			parts.push(topLevel.join('\n\n'));
		}

		if (bundle.namespaceMembers.length > 0)
		{
			const nsBody = bundle.namespaceMembers
				.map((m) => convertIndentationToTabs(m.text))
				.join('\n\n');

			const indented = indentBody(nsBody);
			parts.push(`declare namespace ${bundle.namespace} {\n${indented}\n}`);
		}
	}

	if (mode === 'module' || mode === 'both')
	{
		const moduleName = options.moduleName;
		if (moduleName)
		{
			const moduleParts: string[] = [];

			for (const m of bundle.moduleTopLevelMembers)
			{
				const rendered = convertIndentationToTabs(m.text);
				moduleParts.push(addExportKeyword(rendered));
			}

			for (const m of bundle.namespaceMembers)
			{
				const rendered = convertIndentationToTabs(m.text);
				moduleParts.push(addExportKeyword(rendered));
			}

			if (moduleParts.length > 0)
			{
				const moduleBody = moduleParts.join('\n\n');
				const indented = indentBody(moduleBody);
				parts.push(`declare module '${moduleName}' {\n${indented}\n}`);
			}
		}
	}

	if (parts.length === 0)
	{
		return '';
	}

	const body = parts.join('\n\n');

	return `/* eslint-disable */\n${body}\n`;
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

export function hasAnyStatements(bundle: LaidOutBundle): boolean
{
	return bundle.topLevelMembers.length > 0 || bundle.namespaceMembers.length > 0;
}
