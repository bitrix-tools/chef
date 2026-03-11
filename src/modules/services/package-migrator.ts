import * as fs from 'node:fs/promises';

import { hgRename } from '../../utils/vcs/hg/rename';

import type { MigrationEngine } from '../engines/migration/migration-engine';
import type { BasePackage } from '../packages/base-package';

export type RenameFileResult = {
	from: string;
	to: string;
	success: boolean;
};

export type ConvertFileResult = {
	path: string;
	success: boolean;
};

export class PackageMigrator
{
	readonly #package: BasePackage;

	constructor(extensionPackage: BasePackage)
	{
		this.#package = extensionPackage;
	}

	async renameFile(filePath: string): Promise<RenameFileResult>
	{
		const tsPath = filePath.replace(/\.js$/, '.ts');
		const renameResult = await hgRename(filePath, tsPath);

		return {
			from: filePath,
			to: tsPath,
			success: renameResult.status === 'ok',
		};
	}

	async convertFile(filePath: string): Promise<ConvertFileResult>
	{
		try
		{
			const sourceCode = await fs.readFile(filePath, 'utf8');
			const engine = await PackageMigrator.#getMigrationEngine();
			const result = await engine.migrate({ code: sourceCode });

			if (!result.success)
			{
				return { path: filePath, success: false };
			}

			await fs.writeFile(filePath, result.code, 'utf8');

			return { path: filePath, success: true };
		}
		catch
		{
			return { path: filePath, success: false };
		}
	}

	async updateBundleConfigEntryPoint(): Promise<boolean>
	{
		const bundleConfig = this.#package.getBundleConfig();
		const input = bundleConfig.get('input');

		if (typeof input === 'string')
		{
			const tsEntryPoint = input.replace(/\.js$/, '.ts');
			bundleConfig.set('input', tsEntryPoint);
			await bundleConfig.save(this.#package.getBundleConfigJsFilePath());

			return true;
		}

		return false;
	}

	async renameBundleConfig(): Promise<boolean>
	{
		const bundleConfigJsPath = this.#package.getBundleConfigJsFilePath();
		const bundleConfigTsPath = bundleConfigJsPath.replace(/\.js$/, '.ts');
		const renameResult = await hgRename(bundleConfigJsPath, bundleConfigTsPath);

		return renameResult.status === 'ok';
	}

	static #enginePromise: Promise<MigrationEngine> | null = null;

	static #getMigrationEngine(): Promise<MigrationEngine>
	{
		if (!PackageMigrator.#enginePromise)
		{
			PackageMigrator.#enginePromise = (async () => {
				const { MigrationEngine } = await import('../engines/migration/migration-engine');
				const { FlowToTsStrategy } = await import('../engines/migration/flow-to-ts/flow-to-ts-strategy');

				return new MigrationEngine(new FlowToTsStrategy());
			})();
		}

		return PackageMigrator.#enginePromise;
	}
}
