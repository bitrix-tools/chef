import fg from 'fast-glob';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { PackageFactory } from '../../modules/packages/package-factory';

type FindPackageOptions = {
	startDirectory: string,
	packageFactory: PackageFactory,
	skipProtected?: boolean,
};

export function findPackages({ startDirectory, packageFactory, skipProtected = false }: FindPackageOptions): NodeJS.ReadableStream
{
	const patterns = [
		'**/bundle.config.js',
		'**/bundle.config.ts',
		'**/script.es6.js',
	];

	const fastGlobStream = fg.stream(
		patterns,
		{
			cwd: startDirectory,
			dot: true,
			onlyFiles: true,
			unique: true,
			absolute: true,
		},
	);

	let count = 0;

	const transformStream = new Transform({
		objectMode: true,
		transform(chunk: Buffer, encoding: BufferEncoding, callback: () => void) {
			const extensionDir = path.dirname(
				chunk.toString(encoding),
			);

			const extension = packageFactory.create({
				path: extensionDir,
			});

			// Check if we're in the extension directory
			const isInExtensionDir = startDirectory === extensionDir ||
				startDirectory.startsWith(extensionDir + path.sep);

			// Skip protected extensions unless we're in their directory
			if (skipProtected && extension.getBundleConfig().get('protected') && !isInExtensionDir)
			{
				callback();
				return;
			}

			count++;
			this.push({
				extension,
				count,
				explicit: isInExtensionDir,
			});

			callback();
		},
		flush(callback: () => void) {
			this.emit('done', { count });
			callback();
		},
	});

	return Readable.from(fastGlobStream).pipe(transformStream);
}
