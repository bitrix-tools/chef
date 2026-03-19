import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { Environment } from '../../environment/environment';
import { TemplateManager } from './template-manager';
import { AliasGenerator } from './alias-generator';
import { renderTemplate } from '../../utils/render-template';
import { FileFinder } from '../../utils/file-finder';
import { createInputFileName } from '../../utils/create-input-file-name';
import { createOutputFileName } from '../../utils/create-output-file-name';
import { createNamespace } from '../../utils/create-namespace';
import { toPascalCase } from '../../utils/to-pascal-case';
import { resolvePackage } from '../../utils/package/resolve-package';

export type CreatePackageOptions = {
	extensionName: string;
	tech?: 'ts' | 'js';
};

export type CreatedFile = {
	relativePath: string;
	absolutePath: string;
};

export type CreatePackageResult = {
	packagePath: string;
	files: CreatedFile[];
	aliasesUpdated: boolean;
};

export class PackageCreator
{
	readonly #templateDirectory: string;

	constructor(templateDirectory: string)
	{
		this.#templateDirectory = templateDirectory;
	}

	async create(options: CreatePackageOptions): Promise<CreatePackageResult>
	{
		const { extensionName } = options;
		const packagePath = resolvePackage(extensionName);
		const useTypeScript = this.#detectTypeScript(options.tech, packagePath);

		const templateManager = new TemplateManager(this.#templateDirectory);

		const extension = useTypeScript ? 'ts' : 'js';
		const className = toPascalCase(extensionName.split('.').at(-1));
		const inputFileName = createInputFileName(extensionName, extension);
		const outputFileName = createOutputFileName(extensionName, 'js');

		const files = await this.#generateFiles(templateManager, {
			extensionName,
			className,
			inputFileName,
			outputFileName,
			useTypeScript,
		});

		await this.#writeFiles(packagePath, files);

		const createdFiles: CreatedFile[] = files.map(({ relativePath }) => ({
			relativePath,
			absolutePath: path.join(packagePath, relativePath),
		}));

		const aliasesUpdated = useTypeScript
			? await this.#updateAliases(extensionName, packagePath)
			: false;

		return {
			packagePath,
			files: createdFiles,
			aliasesUpdated,
		};
	}

	resolvePackagePath(extensionName: string): string
	{
		return resolvePackage(extensionName);
	}

	#detectTypeScript(tech: string | undefined, packagePath: string): boolean
	{
		if (tech === 'js')
		{
			return false;
		}

		if (tech === 'ts')
		{
			return true;
		}

		const tsConfig = FileFinder.findUpFile({
			fileName: 'tsconfig.json',
			fromDir: packagePath,
			rootDir: Environment.getRoot(),
		});

		return typeof tsConfig === 'string' && tsConfig.length > 0;
	}

	async #generateFiles(
		templateManager: TemplateManager,
		options: {
			extensionName: string;
			className: string;
			inputFileName: string;
			outputFileName: string;
			useTypeScript: boolean;
		},
	): Promise<Array<{ relativePath: string; content: string }>>
	{
		const { extensionName, className, inputFileName, outputFileName, useTypeScript } = options;
		const extension = useTypeScript ? 'ts' : 'js';

		const bundleConfigTemplateName = useTypeScript ? 'bundle.config.ts.txt' : 'bundle.config.js.txt';
		const bundleConfigTemplate = await templateManager.get(bundleConfigTemplateName);
		const bundleConfigContent = renderTemplate({
			template: bundleConfigTemplate,
			replacements: {
				inputPath: `./src/${inputFileName}`,
				outputPath: `./dist/${outputFileName}`,
				namespace: createNamespace(extensionName),
			},
		});

		const configPhpTemplate = await templateManager.get('config.php.txt');
		const configPhpContent = renderTemplate({
			template: configPhpTemplate,
			replacements: {
				jsPath: `./dist/${outputFileName}`,
				cssPath: `./dist/${createOutputFileName(extensionName, 'css')}`,
			},
		});

		const inputFileTemplate = await templateManager.get('input.js.txt');
		const inputFileContent = renderTemplate({
			template: inputFileTemplate,
			replacements: { name: className },
		});

		const unitTestTemplate = await templateManager.get('unit.test.ts.txt');
		const unitTestContent = renderTemplate({
			template: unitTestTemplate,
			replacements: {
				extensionName,
				name: className,
				inputPath: createInputFileName(extensionName, ''),
			},
		});

		const endToEndTestTemplate = await templateManager.get('e2e.spec.ts.txt');
		const endToEndTestContent = renderTemplate({
			template: endToEndTestTemplate,
			replacements: { name: className },
		});

		return [
			{ relativePath: `bundle.config.${extension}`, content: bundleConfigContent },
			{ relativePath: 'config.php', content: configPhpContent },
			{ relativePath: `src/${inputFileName}`, content: inputFileContent },
			{ relativePath: `test/unit/${createInputFileName(extensionName, useTypeScript ? 'test.ts' : 'test.js')}`, content: unitTestContent },
			{ relativePath: `test/e2e/${createInputFileName(extensionName, useTypeScript ? 'spec.ts' : 'spec.js')}`, content: endToEndTestContent },
		];
	}

	async #writeFiles(packagePath: string, files: Array<{ relativePath: string; content: string }>): Promise<void>
	{
		for (const { relativePath, content } of files)
		{
			const absolutePath = path.join(packagePath, relativePath);
			await fs.mkdir(path.dirname(absolutePath), { recursive: true });
			await fs.writeFile(absolutePath, content, 'utf8');
		}
	}

	async #updateAliases(extensionName: string, packagePath: string): Promise<boolean>
	{
		const aliasGenerator = new AliasGenerator();

		return aliasGenerator.addAlias({
			rootPath: Environment.getRoot(),
			extensionName,
			packagePath,
		});
	}
}
