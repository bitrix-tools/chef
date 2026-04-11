/**
 * Wraps a Babel plugin so it only processes classes whose names are in the given set.
 * Works by intercepting ClassDeclaration and ClassExpression visitors at the top level.
 */
export default function filterClassTransform(
	innerPluginFactory: Function,
	classNames: Set<string>,
): Function
{
	return (api: any, options: any, dirname: any) => {
		const inner = innerPluginFactory(api, options, dirname);

		if (!inner.visitor)
		{
			return inner;
		}

		const filteredVisitor = { ...inner.visitor };

		for (const nodeType of ['ClassDeclaration', 'ClassExpression'])
		{
			const original = filteredVisitor[nodeType];
			if (!original)
			{
				continue;
			}

			filteredVisitor[nodeType] = wrapClassVisitor(original, classNames);
		}

		return {
			...inner,
			visitor: filteredVisitor,
		};
	};
}

function getClassName(nodePath: any): string | null
{
	// class MyClass { ... }
	if (nodePath.node.id?.name)
	{
		return nodePath.node.id.name;
	}

	// const MyClass = class { ... }
	if (
		nodePath.parentPath?.isVariableDeclarator()
		&& nodePath.parentPath.node.id?.type === 'Identifier'
	)
	{
		return nodePath.parentPath.node.id.name;
	}

	return null;
}

function shouldTransform(nodePath: any, classNames: Set<string>): boolean
{
	const name = getClassName(nodePath);

	return name !== null && classNames.has(name);
}

function wrapClassVisitor(original: any, classNames: Set<string>): any
{
	if (typeof original === 'function')
	{
		return function (this: any, nodePath: any, state: any) {
			if (shouldTransform(nodePath, classNames))
			{
				return original.call(this, nodePath, state);
			}
		};
	}

	const wrapped: Record<string, any> = {};

	if (original.enter)
	{
		wrapped.enter = function (this: any, nodePath: any, state: any) {
			if (shouldTransform(nodePath, classNames))
			{
				return original.enter.call(this, nodePath, state);
			}
		};
	}

	if (original.exit)
	{
		wrapped.exit = function (this: any, nodePath: any, state: any) {
			if (shouldTransform(nodePath, classNames))
			{
				return original.exit.call(this, nodePath, state);
			}
		};
	}

	return wrapped;
}
