import type { BasePackage } from './base-package';
import { Environment } from '../../environment/environment';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Readable, Transform, PassThrough } from 'node:stream';
import fg from 'fast-glob';
import { PackageFactoryProvider } from './providers/package-factory-provider';
import { MemoryCache } from '../../utils/memory-cache';

const isExtensionName = (name: string) => {
	return /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/.test(name);
};

const isGlobPattern = (name: string) => {
	return /[*?!\[\]]/.test(name);
};

export class PackageResolver
{
	static #cache: MemoryCache = new MemoryCache();

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
					if (fs.existsSync(extensionPath))
					{
						return packageFactory.create({
							path: extensionPath,
						});
					}
				}

				if (Environment.getType() === 'project')
				{
					const localExtensionPath = path.join(root, 'local', 'js', ...segments);
					if (fs.existsSync(localExtensionPath))
					{
						return packageFactory.create({
							path: localExtensionPath,
						});
					}

					const productExtensionPath = path.join(root, 'bitrix', 'js', ...segments);
					if (fs.existsSync(productExtensionPath))
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

		// Build search directories based on environment
		const searchDirs: string[] = [];

		if (Environment.getType() === 'source')
		{
			const modules = fg.sync('*', {
				cwd: root,
				onlyDirectories: true,
				ignore: ['node_modules', '.git'],
			});

			for (const moduleName of modules)
			{
				const jsDir = path.join(root, moduleName, 'install', 'js');
				if (fs.existsSync(jsDir))
				{
					searchDirs.push(jsDir);
				}
			}
		}

		if (Environment.getType() === 'project')
		{
			const localJs = path.join(root, 'local', 'js');
			const bitrixJs = path.join(root, 'bitrix', 'js');

			if (fs.existsSync(localJs))
			{
				searchDirs.push(localJs);
			}
			if (fs.existsSync(bitrixJs))
			{
				searchDirs.push(bitrixJs);
			}
		}

		if (searchDirs.length === 0)
		{
			process.nextTick(() => {
				output.emit('done', { count });
				output.end();
			});
			return output;
		}

		// Convert patterns to glob file patterns
		const configPatterns = patterns.flatMap((pattern) => {
			const pathPattern = pattern.replace(/\./g, '/');
			return [
				`${pathPattern}/bundle.config.js`,
				`${pathPattern}/bundle.config.ts`,
			];
		});

		// Search in each directory
		let pendingDirs = searchDirs.length;

		for (const searchDir of searchDirs)
		{
			const fastGlobStream = fg.stream(configPatterns, {
				cwd: searchDir,
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
					pendingDirs--;
					if (pendingDirs === 0)
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
