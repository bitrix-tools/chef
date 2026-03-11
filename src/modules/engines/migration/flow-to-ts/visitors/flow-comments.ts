import type { TraverseOptions } from '@babel/traverse';

export const flowCommentsVisitor: TraverseOptions = {
	Program(path)
	{
		path.node.body.forEach((node) => {
			if (node.leadingComments)
			{
				node.leadingComments = node.leadingComments.filter((comment) => {
					const value = comment.value.trim();
					return !(value.includes('@flow') || value.includes('$FlowIssue'));
				});
			}

			if (node.trailingComments)
			{
				node.trailingComments = node.trailingComments.filter((comment) => {
					const value = comment.value.trim();
					return !(value.includes('@flow') || value.includes('$FlowIssue'));
				});
			}

			if (node.leadingComments)
			{
				for (const comment of node.leadingComments)
				{
					comment.value = comment.value
						.replace(/\$(FlowFixMe|FlowExpectError)/g, '@ts-expect-error')
						.replace(/\$FlowIgnore/g, '@ts-ignore');
				}
			}

			if (node.trailingComments)
			{
				for (const comment of node.trailingComments)
				{
					comment.value = comment.value
						.replace(/\$(FlowFixMe|FlowExpectError)/g, '@ts-expect-error')
						.replace(/\$FlowIgnore/g, '@ts-ignore');
				}
			}
		});
	},
};
