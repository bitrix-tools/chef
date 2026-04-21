import type { DeclarationBundle, DeclarationMember, NpmModule } from './declaration-bundler';

export interface LaidOutBundle
{
	topLevelMembers: DeclarationMember[];
	moduleTopLevelMembers: DeclarationMember[];
	namespaceMembers: DeclarationMember[];
	npmModules: NpmModule[];
	namespace: string;
}

export function qualifyTopLevelReferences(bundle: DeclarationBundle, namespace: string): LaidOutBundle
{
	const namespaceMemberNames = bundle.namespaceMemberNames;
	const moduleTopLevelMembers = bundle.topLevelMembers;

	if (namespaceMemberNames.size === 0 || bundle.topLevelMembers.length === 0)
	{
		return {
			topLevelMembers: bundle.topLevelMembers,
			moduleTopLevelMembers,
			namespaceMembers: bundle.namespaceMembers,
			npmModules: bundle.npmModules,
			namespace,
		};
	}

	const qualified = bundle.topLevelMembers.map((member) => ({
		...member,
		text: qualifyReferences(member.text, namespaceMemberNames, namespace),
	}));

	return {
		topLevelMembers: qualified,
		moduleTopLevelMembers,
		namespaceMembers: bundle.namespaceMembers,
		npmModules: bundle.npmModules,
		namespace,
	};
}

function qualifyReferences(text: string, namespaceMemberNames: Set<string>, namespace: string): string
{
	let result = text;

	for (const memberName of namespaceMemberNames)
	{
		const pattern = new RegExp(`\\b${escapeRegExp(memberName)}\\b`, 'g');
		result = result.replace(pattern, `${namespace}.${memberName}`);
	}

	return result;
}

function escapeRegExp(s: string): string
{
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
