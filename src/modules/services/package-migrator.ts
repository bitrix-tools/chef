import * as fs from 'node:fs/promises';

import { gitRename } from '../../utils/vcs/git/rename';

import type { MigrationEngine } from '../engines/migration/migration-engine';
import type { BasePackage } from '../packages/base-package';

export type ConvertExportResult = {
	path: string;
	converted: boolean;
};

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
		const renameResult = await gitRename(filePath, tsPath);

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
		const renameResult = await gitRename(bundleConfigJsPath, bundleConfigTsPath);

		return renameResult.status === 'ok';
	}

	/**
	 * Rewrites the CommonJS export of bundle.config.ts into an ES module one:
	 * `module.exports = { ... }` becomes `export default { ... }`. The `.js` config
	 * uses CommonJS, but the `.ts` config must be an ES module. Returns `converted: false`
	 * when there is nothing to rewrite (already an ES export), which is not an error.
	 */
	async convertBundleConfigExport(): Promise<ConvertExportResult>
	{
		const bundleConfigTsPath = this.#package.getBundleConfigTsFilePath();
		const source = await fs.readFile(bundleConfigTsPath, 'utf8');

		const parser = await import('@babel/parser');
		const traverseModule = await import('@babel/traverse');
		const generateModule = await import('@babel/generator');
		const t = await import('@babel/types');
		const traverse = (traverseModule as any).default ?? traverseModule;
		const generate = (generateModule as any).default ?? generateModule;

		const ast = parser.parse(source, {
			sourceType: 'module',
			plugins: ['typescript'],
		});

		let converted = false;
		traverse(ast, {
			ExpressionStatement(path: any)
			{
				const { expression } = path.node;
				if (
					t.isAssignmentExpression(expression, { operator: '=' })
					&& t.isMemberExpression(expression.left)
					&& t.isIdentifier(expression.left.object, { name: 'module' })
					&& t.isIdentifier(expression.left.property, { name: 'exports' })
				)
				{
					path.replaceWith(t.exportDefaultDeclaration(expression.right));
					converted = true;
				}
			},
		});

		if (!converted)
		{
			return { path: bundleConfigTsPath, converted: false };
		}

		const { code } = generate(ast, { retainLines: true }, source);

		// Babel's generator reformats (tabs → spaces, drops trailing commas). Run the
		// result through prettier with the project's style so the config keeps the same
		// look as the rest of the migrated sources.
		const prettier = await import('prettier');
		const formatted = await prettier.format(code, {
			parser: 'typescript',
			useTabs: true,
			singleQuote: true,
			trailingComma: 'all',
			arrowParens: 'always',
			printWidth: 120,
		});

		await fs.writeFile(bundleConfigTsPath, formatted, 'utf8');

		return { path: bundleConfigTsPath, converted: true };
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
