import type { DeclarationBundle, DeclarationMember, NpmModule } from './declaration-bundler';

export interface LaidOutBundle
{
	topLevelMembers: DeclarationMember[];
	moduleTopLevelMembers: DeclarationMember[];
	namespaceMembers: DeclarationMember[];
	npmModules: NpmModule[];
	namespace: string;
}

// Top-level references to namespace members are already qualified at collection time
// (positionally, via TypeChecker) inside DeclarationBundler. For module-mode rendering,
// the unqualified variant is used so references stay in the same lexical scope.
export function qualifyTopLevelReferences(bundle: DeclarationBundle, namespace: string): LaidOutBundle
{
	const moduleTopLevelMembers = bundle.topLevelMembers.map((m) => ({
		...m,
		text: m.textUnqualified ?? m.text,
	}));

	return {
		topLevelMembers: bundle.topLevelMembers,
		moduleTopLevelMembers,
		namespaceMembers: bundle.namespaceMembers,
		npmModules: bundle.npmModules,
		namespace,
	};
}
