import * as path from 'node:path';
import * as fs from 'node:fs';
import { Readable, Transform, PassThrough } from 'node:stream';

import fg from 'fast-glob';
import chalk from 'chalk';
import boxen from 'boxen';

import { Environment } from '../../environment/environment';
import { PackageFactoryProvider } from './providers/package-factory-provider';
import { MemoryCache } from '../../utils/memory-cache';
import { CF } from '../../diagnostics/diagnostic-codes';

import type { BasePackage } from './base-package';

const isExtensionName = (name: string) => {
	return /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/.test(name);
};

const isGlobPattern = (name: string) => {
	return /[*?!\[\]]/.test(name);
};

const hasExtensionConfig = (extensionPath: string): boolean => {
	return (
		fs.existsSync(path.join(extensionPath, 'bundle.config.js'))
		|| fs.existsSync(path.join(extensionPath, 'bundle.config.ts'))
		|| fs.existsSync(path.join(extensionPath, 'script.es6.js'))
	);
};

function findExtensionPath(name: string): string | null
{
	const segments = name.split('.');
	const root = Environment.getRoot();

	if (Environment.getType() === 'source')
	{
		const moduleName = segments.at(0);
		const extensionPath = path.join(root, moduleName, 'install', 'js', ...segments);
		if (fs.existsSync(extensionPath))
		{
			return extensionPath;
		}
	}

	if (Environment.getType() === 'project')
	{
		const localPath = path.join(root, 'local', 'js', ...segments);
		if (fs.existsSync(localPath))
		{
			return localPath;
		}

		const productPath = path.join(root, 'bitrix', 'js', ...segments);
		if (fs.existsSync(productPath))
		{
			return productPath;
		}
	}

	return null;
}

function formatNotFoundError(name: string): string
{
	const extensionPath = findExtensionPath(name);

	const lines: string[] = [];
	lines.push(chalk.red(`${CF.NOT_FOUND}: Extension ${chalk.bold(name)} not found`));
	lines.push('');

	if (extensionPath)
	{
		lines.push(`Directory ${chalk.dim(extensionPath)} exists,`);
		lines.push(`but does not contain ${chalk.bold('bundle.config.js')} or ${chalk.bold('bundle.config.ts')}.`);
		lines.push('');
		lines.push(`This path is likely a ${chalk.bold('directory of extensions')}, not an extension itself.`);
		lines.push(`Use ${chalk.cyan(`${name}.*`)} to run for all extensions inside,`);
		lines.push(`or ${chalk.cyan(`${name}.**`)} to include nested extensions.`);
	}
	else
	{
		lines.push(`No extension directory found for ${chalk.bold(name)}.`);
		lines.push(`Check that the name is correct and the extension exists.`);
	}

	return boxen(lines.join('\n'), {
		padding: 1,
		borderStyle: 'round',
		borderColor: 'yellow',
	});
}

export interface ParsedExtensionPattern
{
	fixedSegments: string[];
	configPatterns: string[];
}

export function parseExtensionPattern(pattern: string): ParsedExtensionPattern
{
	const segments = pattern.split('.');

	const fixedSegments: string[] = [];
	let globStart = 0;
	for (let i = 0; i < segments.length; i++)
	{
		if (isGlobPattern(segments[i]))
		{
			globStart = i;
			break;
		}
		fixedSegments.push(segments[i]);
		globStart = i + 1;
	}

	const globSegments = segments.slice(globStart);
	const globPath = globSegments.length > 0
		? globSegments.join('/') + '/'
		: '';

	const configPatterns = [
		`${globPath}bundle.config.js`,
		`${globPath}bundle.config.ts`,
	];

	return { fixedSegments, configPatterns };
}

export class PackageResolver
{
	static #cache: MemoryCache = new MemoryCache();

	static clearCache(): void
	{
		this.#cache.flush();
	}

	static resolve(packageName: string): BasePackage | null
	{
		return this.#cache.remember(packageName, () => {
			if (isExtensionName(packageName))
			{
				const segments = packageName.split('.');
				const root = Environment.getRoot();
				const packageFactory = PackageFactoryProvider.create();

				if (Environment.getType() === 'source')
				{
					const moduleName = segments.at(0);
					const extensionPath = path.join(root, moduleName, 'install', 'js', ...segments);
					if (fs.existsSync(extensionPath) && hasExtensionConfig(extensionPath))
					{
						return packageFactory.create({
							path: extensionPath,
						});
					}
				}

				if (Environment.getType() === 'project')
				{
					const localExtensionPath = path.join(root, 'local', 'js', ...segments);
					if (fs.existsSync(localExtensionPath) && hasExtensionConfig(localExtensionPath))
					{
						return packageFactory.create({
							path: localExtensionPath,
						});
					}

					const productExtensionPath = path.join(root, 'bitrix', 'js', ...segments);
					if (fs.existsSync(productExtensionPath) && hasExtensionConfig(productExtensionPath))
					{
						return packageFactory.create({
							path: productExtensionPath,
						});
					}
				}
			}

			return null;
		});
	}

	static resolveStream(names: string[]): NodeJS.ReadableStream
	{
		const root = Environment.getRoot();
		const packageFactory = PackageFactoryProvider.create();
		const output = new PassThrough({ objectMode: true });

		// Separate exact names from glob patterns
		const exactNames: string[] = [];
		const patterns: string[] = [];

		for (const name of names)
		{
			if (isGlobPattern(name))
			{
				patterns.push(name);
			}
			else
			{
				exactNames.push(name);
			}
		}

		let count = 0;
		const seenPaths = new Set<string>();

		// Resolve exact names asynchronously to allow listeners to attach first
		process.nextTick(() => {
			for (const name of exactNames)
			{
				const extension = this.resolve(name);
				if (extension)
				{
					const extPath = extension.getPath();
					if (!seenPaths.has(extPath))
					{
						seenPaths.add(extPath);
						count++;
						output.push({ extension, count, explicit: true });
					}
				}
				else
				{
					console.log('');
					console.log(formatNotFoundError(name));
				}
			}

			// If no patterns, finish immediately
			if (patterns.length === 0)
			{
				output.emit('done', { count });
				output.end();
			}
		});

		// If no patterns, return early (processing happens in nextTick above)
		if (patterns.length === 0)
		{
			return output;
		}

		// Build search tasks: pairs of [searchDir, configPatterns]
		const searchTasks: Array<{ dir: string, patterns: string[] }> = [];

		for (const pattern of patterns)
		{
			const { fixedSegments, configPatterns } = parseExtensionPattern(pattern);

			if (Environment.getType() === 'source')
			{
				if (fixedSegments.length > 0)
				{
					const moduleName = fixedSegments[0];
					const deepPath = path.join(root, moduleName, 'install', 'js', ...fixedSegments);
					if (fs.existsSync(deepPath))
					{
						searchTasks.push({ dir: deepPath, patterns: configPatterns });
					}
				}
				else
				{
					// Glob in first segment — scan all modules
					const modules = fs.readdirSync(root, { withFileTypes: true });
					for (const entry of modules)
					{
						if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.git')
						{
							continue;
						}
						const jsDir = path.join(root, entry.name, 'install', 'js');
						if (fs.existsSync(jsDir))
						{
							searchTasks.push({ dir: jsDir, patterns: configPatterns });
						}
					}
				}
			}

			if (Environment.getType() === 'project')
			{
				const baseDirs = [
					path.join(root, 'local', 'js'),
					path.join(root, 'bitrix', 'js'),
				];

				for (const baseDir of baseDirs)
				{
					const deepPath = fixedSegments.length > 0
						? path.join(baseDir, ...fixedSegments)
						: baseDir;

					if (fs.existsSync(deepPath))
					{
						searchTasks.push({ dir: deepPath, patterns: configPatterns });
					}
				}
			}
		}

		if (searchTasks.length === 0)
		{
			process.nextTick(() => {
				output.emit('done', { count });
				output.end();
			});
			return output;
		}

		// Search in each directory
		let pendingTasks = searchTasks.length;

		for (const task of searchTasks)
		{
			const fastGlobStream = fg.stream(task.patterns, {
				cwd: task.dir,
				absolute: true,
				onlyFiles: true,
			});

			const transformStream = new Transform({
				objectMode: true,
				transform(chunk: Buffer, encoding: BufferEncoding, callback: () => void)
				{
					const extensionDir = path.dirname(chunk.toString(encoding));

					if (!seenPaths.has(extensionDir))
					{
						seenPaths.add(extensionDir);
						const extension = packageFactory.create({ path: extensionDir });

						// Skip protected extensions when found via glob pattern
						if (extension.getBundleConfig().get('protected'))
						{
							callback();
							return;
						}

						count++;
						this.push({ extension, count, explicit: false });
					}

					callback();
				},
			});

			Readable.from(fastGlobStream)
				.pipe(transformStream)
				.on('data', (data: unknown) => output.push(data))
				.on('end', () => {
					pendingTasks--;
					if (pendingTasks === 0)
					{
						output.emit('done', { count });
						output.end();
					}
				})
				.on('error', (err: Error) => output.emit('error', err));
		}

		return output;
	}
}
