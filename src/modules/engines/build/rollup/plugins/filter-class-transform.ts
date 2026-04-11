import type { Plugin } from 'rollup';

/**
 * Rollup plugin that applies Babel class transformation plugins
 * only to files containing class declarations matching the given names.
 */
export default function filterClassTransform(options: {
	classNames: string[];
	extensions: string[];
}): Plugin
{
	const classNameSet = new Set(options.classNames);
	const extensionSet = new Set(options.extensions);

	const classPattern = new RegExp(
		`(?:^|\\n)\\s*(?:export\\s+(?:default\\s+)?)?class\\s+(${
			options.classNames.map(escapeRegExp).join('|')
		})\\b`,
	);

	let babelTransform: ((code: string, id: string) => Promise<{ code: string; map: any } | null>) | null = null;

	return {
		name: 'filter-class-transform',

		async transform(code, id)
		{
			const ext = '.' + id.split('.').pop();
			if (!extensionSet.has(ext))
			{
				return null;
			}

			if (!classPattern.test(code))
			{
				return null;
			}

			if (!babelTransform)
			{
				babelTransform = await createBabelTransform(classNameSet);
			}

			return babelTransform(code, id);
		},
	};
}

async function createBabelTransform(classNames: Set<string>): Promise<(code: string, id: string) => Promise<{ code: string; map: any } | null>>
{
	const [
		babel,
		{ default: externalHelpersPlugin },
		{ default: transformClassProperties },
		{ default: transformPrivateMethods },
		{ default: transformPrivatePropertyInObject },
		{ default: transformClasses },
	] = await Promise.all([
		import('@babel/core'),
		import('@babel/plugin-external-helpers'),
		import('@babel/plugin-transform-class-properties'),
		import('@babel/plugin-transform-private-methods'),
		import('@babel/plugin-transform-private-property-in-object'),
		import('@babel/plugin-transform-classes'),
	]);

	return async (code: string, id: string) => {
		const result = await babel.transformAsync(code, {
			filename: id,
			babelrc: false,
			configFile: false,
			compact: false,
			sourceMaps: true,
			plugins: [
				externalHelpersPlugin,
				createClassFilterPlugin(classNames),
				transformClassProperties,
				transformPrivateMethods,
				transformPrivatePropertyInObject,
				transformClasses,
			],
		});

		if (!result?.code)
		{
			return null;
		}

		return {
			code: result.code,
			map: result.map,
		};
	};
}

/**
 * Babel plugin that marks classes NOT in the filter set
 * so that transform-classes skips them.
 *
 * Works by visiting ClassDeclaration/ClassExpression before
 * transform-classes runs, and calling path.skip() on non-matching classes.
 * This prevents subsequent visitors from processing these nodes.
 */
function createClassFilterPlugin(classNames: Set<string>): any
{
	return {
		visitor: {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'ClassDeclaration|ClassExpression'(path: any)
			{
				const name = getClassName(path);
				if (!name || !classNames.has(name))
				{
					path.skip();
				}
			},
		},
	};
}

function getClassName(path: any): string | null
{
	if (path.node.id?.name)
	{
		return path.node.id.name;
	}

	if (
		path.parentPath?.isVariableDeclarator()
		&& path.parentPath.node.id?.type === 'Identifier'
	)
	{
		return path.parentPath.node.id.name;
	}

	return null;
}

function escapeRegExp(str: string): string
{
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
