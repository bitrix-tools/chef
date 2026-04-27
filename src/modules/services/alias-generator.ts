import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { PackageFactoryProvider } from '../packages/providers/package-factory-provider';
import { PackageResolver } from '../packages/package-resolver';
import { findPackages } from '../../utils/package/find-packages';

import type { CompilerOptions } from 'typescript';
import type { BasePackage } from '../packages/base-package';

type TSConfig = {
	compilerOptions: CompilerOptions;
};

export type UpdateResult = {
	added: string[];
	removed: string[];
	filePath: string;
};

const EXTENSION_NAME_PATTERN = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/;

export class AliasGenerator
{
	async generate(options: { rootPath: string; onProgress?: (count: number) => void }): Promise<{ aliasesCount: number; filePath: string }>
	{
		const { rootPath, onProgress } = options;

		const packageFactory = PackageFactoryProvider.create();
		const extensionsStream: NodeJS.ReadableStream = findPackages({
			startDirectory: rootPath,
			packageFactory,
		});

		const typesPath = (() => {
			const devExtension = PackageResolver.resolve('ui.dev');
			if (devExtension)
			{
				return devExtension.getInputPath();
			}

			return '';
		})();

		const tsconfig: TSConfig = {
			compilerOptions: {
				baseUrl: rootPath,
				types: [typesPath],
				paths: {},
			},
		};

		let aliasesCount = 0;

		await new Promise<void>((resolve, reject) => {
			extensionsStream
				.on('data', ({ extension }: { extension: BasePackage }) => {
					if (!EXTENSION_NAME_PATTERN.test(extension.getName())) return;
					if (extension.getBundleConfig().get('alias') === false) return;

					const relativePath = path.relative(
						rootPath,
						extension.getInputPath(),
					);
					tsconfig.compilerOptions.paths![extension.getName()] = [`./${relativePath}`];

					aliasesCount++;
					onProgress?.(aliasesCount);
				})
				.on('done', () => resolve())
				.on('error', (err: Error) => reject(err));
		});

		const filePath = path.join(rootPath, 'aliases.tsconfig.json');
		await fs.writeFile(filePath, JSON.stringify(tsconfig, null, 4));

		return { aliasesCount, filePath };
	}

	async update(options: { rootPath: string; added: string[]; removed: string[] }): Promise<UpdateResult>
	{
		const { rootPath, added, removed } = options;
		const filePath = path.join(rootPath, 'aliases.tsconfig.json');

		const aliasesRaw = await fs.readFile(filePath, 'utf8');
		const aliases = JSON.parse(aliasesRaw);
		aliases.compilerOptions ??= {};
		aliases.compilerOptions.paths ??= {};

		const packageFactory = PackageFactoryProvider.create();

		const addedNames: string[] = [];
		for (const packagePath of added)
		{
			const absolutePath = path.isAbsolute(packagePath) ? packagePath : path.join(rootPath, packagePath);
			const extension = packageFactory.create({ path: absolutePath });
			const name = extension.getName();

			if (!name || !EXTENSION_NAME_PATTERN.test(name)) continue;
			if (extension.getBundleConfig().get('alias') === false) continue;

			const relativePath = path.relative(rootPath, extension.getInputPath());
			aliases.compilerOptions.paths[name] = [`./${relativePath}`];
			addedNames.push(name);
		}

		const removedNames: string[] = [];
		for (const packagePath of removed)
		{
			const absolutePath = path.isAbsolute(packagePath) ? packagePath : path.join(rootPath, packagePath);
			const extension = packageFactory.create({ path: absolutePath });
			const name = extension.getName();

			if (name && aliases.compilerOptions.paths[name])
			{
				delete aliases.compilerOptions.paths[name];
				removedNames.push(name);
			}
		}

		await fs.writeFile(filePath, JSON.stringify(aliases, null, 4));

		return { added: addedNames, removed: removedNames, filePath };
	}

	async addAlias(options: { rootPath: string; extensionName: string; packagePath: string }): Promise<boolean>
	{
		try
		{
			const { rootPath, extensionName, packagePath } = options;
			const aliasesPath = path.join(rootPath, 'aliases.tsconfig.json');
			const aliasesRaw = await fs.readFile(aliasesPath, 'utf8');
			const aliases = JSON.parse(aliasesRaw);
			const srcPath = path.join(packagePath, 'src');
			const relPath = `./${path.relative(rootPath, srcPath)}`;
			aliases.compilerOptions ??= {};
			aliases.compilerOptions.paths ??= {};
			aliases.compilerOptions.paths[extensionName] = [relPath];
			await fs.writeFile(aliasesPath, JSON.stringify(aliases, null, 4));

			return true;
		}
		catch
		{
			return false;
		}
	}
}
