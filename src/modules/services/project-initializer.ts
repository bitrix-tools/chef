import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { TemplateManager } from './template-manager';
import { PackageFactoryProvider } from '../packages/providers/package-factory-provider';
import { PackageResolver } from '../packages/package-resolver';
import { findPackages } from '../../utils/package/find-packages';
import { safeFileWrite, SaveFileStatus } from '../../utils/safe-file-write';

import type { CompilerOptions } from 'typescript';
import type { BasePackage } from '../packages/base-package';

type TSConfig = {
	compilerOptions: CompilerOptions;
};

export type FileResult = {
	name: string;
	status: SaveFileStatus;
};

export type InitTestsResult = {
	files: FileResult[];
};

export type InitBuildResult = {
	aliasesCount: number;
	files: FileResult[];
};

export { SaveFileStatus };

export class ProjectInitializer
{
	readonly #rootPath: string;
	readonly #templateDirectory: string;

	constructor(options: { rootPath: string; templateDirectory: string })
	{
		this.#rootPath = options.rootPath;
		this.#templateDirectory = options.templateDirectory;
	}

	async initTests(options: { force?: boolean; theme?: object } = {}): Promise<InitTestsResult>
	{
		const templateManager = new TemplateManager(this.#templateDirectory);

		const playwrightConfigPath = path.join(this.#rootPath, 'playwright.config.ts');
		const playwrightConfigContent = await templateManager.get('playwright.config.ts.txt');
		const playwrightConfigStatus = await safeFileWrite({
			filePath: playwrightConfigPath,
			data: playwrightConfigContent,
		});

		const dotEnvTestPath = path.join(this.#rootPath, '.env.test');
		const dotEnvTestContent = await templateManager.get('.env.test.txt');
		const dotEnvTestStatus = await safeFileWrite({
			filePath: dotEnvTestPath,
			data: dotEnvTestContent,
		});

		return {
			files: [
				{ name: 'playwright.config.ts', status: playwrightConfigStatus },
				{ name: '.env.test', status: dotEnvTestStatus },
			],
		};
	}

	async initBuild(options: { onProgress?: (count: number) => void; onAliasesDone?: (count: number) => void; onBeforeFileWrite?: (fileName: string) => void; theme?: object } = {}): Promise<InitBuildResult>
	{
		const packageFactory = PackageFactoryProvider.create();
		const extensionsStream: NodeJS.ReadableStream = findPackages({
			startDirectory: this.#rootPath,
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
				baseUrl: this.#rootPath,
				types: [typesPath],
				paths: {},
			},
		};

		let aliasesCount = 0;

		await new Promise<void>((resolve, reject) => {
			extensionsStream
				.on('data', ({ extension }: { extension: BasePackage }) => {
					if (/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/.test(extension.getName()))
					{
						const relativePath = path.relative(
							this.#rootPath,
							extension.getInputPath(),
						);
						tsconfig.compilerOptions.paths[extension.getName()] = [`./${relativePath}`];

						aliasesCount++;
						options.onProgress?.(aliasesCount);
					}
				})
				.on('done', () => resolve())
				.on('error', (err: Error) => reject(err));
		});

		const aliasesPath = path.join(this.#rootPath, 'aliases.tsconfig.json');
		await fs.writeFile(aliasesPath, JSON.stringify(tsconfig, null, 4));

		options.onAliasesDone?.(aliasesCount);

		const templateManager = new TemplateManager(this.#templateDirectory);

		options.onBeforeFileWrite?.('tsconfig.json');
		const tsConfigPath = path.join(this.#rootPath, 'tsconfig.json');
		const tsConfigContent = await templateManager.get('tsconfig.json.txt');
		const tsConfigStatus = await safeFileWrite({
			filePath: tsConfigPath,
			data: tsConfigContent,
			...(options.theme ? { theme: options.theme } : {}),
		});

		options.onBeforeFileWrite?.('.browserslistrc');
		const browserslistPath = path.join(this.#rootPath, '.browserslistrc');
		const browserslistContent = await templateManager.get('.browserslistrc.txt');
		const browserslistStatus = await safeFileWrite({
			filePath: browserslistPath,
			data: browserslistContent,
			...(options.theme ? { theme: options.theme } : {}),
		});

		return {
			aliasesCount,
			files: [
				{ name: 'aliases.tsconfig.json', status: SaveFileStatus.CREATED },
				{ name: 'tsconfig.json', status: tsConfigStatus },
				{ name: '.browserslistrc', status: browserslistStatus },
			],
		};
	}
}
