import type { TraverseOptions } from '@babel/traverse';

export const flowClassVisitor: TraverseOptions = {
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
