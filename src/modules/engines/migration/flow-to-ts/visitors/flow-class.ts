import type { TraverseOptions } from '@babel/traverse';

export const flowClassVisitor: TraverseOptions = {
	// for (const x: Type of ...) → for (const x of ...)
	ForOfStatement(path)
	{
		const left = path.node.left;
		if (left.type === 'VariableDeclaration')
		{
			for (const declarator of left.declarations)
			{
				if (declarator.id.type === 'Identifier' && declarator.id.typeAnnotation)
				{
					delete declarator.id.typeAnnotation;
				}
			}
		}
	},

	// for (const x: Type in ...) → for (const x in ...)
	ForInStatement(path)
	{
		const left = path.node.left;
		if (left.type === 'VariableDeclaration')
		{
			for (const declarator of left.declarations)
			{
				if (declarator.id.type === 'Identifier' && declarator.id.typeAnnotation)
				{
					delete declarator.id.typeAnnotation;
				}
			}
		}
	},

	ClassProperty({ node })
	{
		if (node.variance && node.variance.kind === 'plus')
		{
			node.readonly = true;
		}

		delete node.variance;
	},

	ArrayPattern(path)
	{
		path.node.elements.forEach((element) => {
			if (element && element.type === 'Identifier' && element.typeAnnotation)
			{
				delete element.typeAnnotation;
			}

			if (element && element.type === 'AssignmentPattern' && element.left)
			{
				const leftSide = element.left;
				if (leftSide.type === 'Identifier' && leftSide.typeAnnotation)
				{
					delete leftSide.typeAnnotation;
				}
			}
		});
	},
};
