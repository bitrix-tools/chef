import type { TraverseOptions } from '@babel/traverse';

export const flowImportsVisitor: TraverseOptions = {
	ImportSpecifier({ node })
	{
		if (node.importKind === 'typeof')
		{
			node.importKind = 'type';
		}
	},
	ImportDeclaration({ node })
	{
		if (node.importKind === 'typeof')
		{
			node.importKind = 'type';
		}
	},
};
