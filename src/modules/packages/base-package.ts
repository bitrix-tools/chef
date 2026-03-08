import * as path from 'node:path';
import * as fs from 'node:fs';
import fg from 'fast-glob';

import browserslist from 'browserslist';

import { BundleConfigManager } from '../config/bundle/bundle-config-manager';
import { PhpConfigManager } from '../config/php/php-config-manager';
import { MemoryCache } from '../../utils/memory-cache';
import { LintResult } from '../linter/lint-result';
import { flattenTree } from '../../utils/flatten-tree';
import { buildDependenciesTree } from '../../utils/package/build-dependencies-tree';

import { Environment } from '../../environment/environment';
import { PackageSizeCalculator } from '../services/package-size-calculator';
import type { BuildResult } from '../engine/build-types';
import type { DependencyNode } from './types/dependency-node';

type BasePackageOptions = {
	path: string,
};

export abstract class BasePackage
{
	static TYPESCRIPT_EXTENSION = 'ts';
	static JAVASCRIPT_EXTENSION = 'js';
	static SOURCE_FILES_PATTERN: Array<string> = [
		`**/*.${BasePackage.JAVASCRIPT_EXTENSION}`,
		`**/*.${BasePackage.TYPESCRIPT_EXTENSION}`,
	];

	readonly #path: string;
	readonly #cache: MemoryCache = new MemoryCache();

	constructor(options: BasePackageOptions)
	{
		this.#path = options.path;
	}

	// region Identity

	abstract getName(): string;
	abstract getModuleName(): string;

	getPath(): string
	{
		return this.#path;
	}

	getPublicPath(): string
	{
		return '';
	}

	// endregion

	// region Config

	getBundleConfigJsFilePath(): string
	{
		return path.join(this.getPath(), 'bundle.config.js');
	}

	hasBundleConfigJsFile(): boolean
	{
		return fs.existsSync(this.getBundleConfigJsFilePath());
	}

	getBundleConfigTsFilePath(): string
	{
		return path.join(this.getPath(), 'bundle.config.ts');
	}

	hasBundleConfigTsFile(): boolean
	{
		return fs.existsSync(this.getBundleConfigTsFilePath());
	}

	getScriptEs6FilePath(): string
	{
		return path.join(this.getPath(), 'script.es6.js');
	}

	hasScriptEs6FilePath(): boolean
	{
		return fs.existsSync(this.getScriptEs6FilePath());
	}

	getBundleConfigFilePath(): string | null
	{
		if (this.hasBundleConfigJsFile())
		{
			return this.getBundleConfigJsFilePath()
		}

		if (this.hasBundleConfigTsFile())
		{
			return this.getBundleConfigTsFilePath();
		}

		return null;
	}

	hasBundleConfigFile(): boolean
	{
		const bundleConfigFilePath = this.getBundleConfigFilePath();

		return (
			bundleConfigFilePath
			&& fs.existsSync(bundleConfigFilePath)
		);
	}

	getPhpConfigFilePath(): string
	{
		return path.join(this.getPath(), 'config.php');
	}

	hasPhpConfigFile(): boolean
	{
		return fs.existsSync(this.getPhpConfigFilePath());
	}

	getPhpConfig(): any
	{
		return this.#cache.remember('phpConfig', () => {
			const config = new PhpConfigManager();
			if (this.hasPhpConfigFile())
			{
				config.loadFromFile(this.getPhpConfigFilePath());
			}

			return config;
		});
	}

	getBundleConfig(): BundleConfigManager
	{
		return this.#cache.remember('bundleConfig', () => {
			const config = new BundleConfigManager();
			if (this.hasBundleConfigFile())
			{
				config.loadFromFile(this.getBundleConfigFilePath());
			}
			else if (this.hasScriptEs6FilePath())
			{
				config.set('input', 'script.es6.js');
				config.set('output', { js: './script.js', css: './style.css' });
				config.set('adjustConfigPhp', false);
			}

			return config;
		});
	}

	// endregion

	// region Source files & paths

	protected resolvePublicPath(relativePath: string): string
	{
		const environmentType = Environment.getType();

		if (environmentType === 'source')
		{
			return `/bitrix/${relativePath}/`;
		}

		if (environmentType === 'project')
		{
			const localPath = `/local/${relativePath}/`;
			const fullLocalPath = path.join(Environment.getRoot(), localPath);
			if (fs.existsSync(fullLocalPath))
			{
				return localPath;
			}

			const bitrixPath = `/bitrix/${relativePath}/`;
			const fullBitrixPath = path.join(Environment.getRoot(), bitrixPath);
			if (fs.existsSync(fullBitrixPath))
			{
				return bitrixPath;
			}
		}

		return '';
	}

	getTargets(): Array<string>
	{
		const bundleConfig = this.getBundleConfig();
		const value = bundleConfig.get('targets');

		if (typeof value === 'string' || Array.isArray(value))
		{
			return browserslist(value);
		}

		const fileTargets = browserslist.loadConfig({
			path: this.getPath(),
		});

		if (fileTargets && fileTargets.length > 0)
		{
			return browserslist(fileTargets);
		}

		return browserslist('baseline widely available');
	}

	getGlobal(): { [name: string]: string }
	{
		const name = this.getName();
		const namespace = this.getBundleConfig().get('namespace');

		return { [name]: namespace };
	}

	getInputPath(): string
	{
		return path.join(this.getPath(), this.getBundleConfig().get('input'));
	}

	getOutputJsPath(): string
	{
		return path.join(this.getPath(), this.getBundleConfig().get('output').js);
	}

	getOutputCssPath(): string
	{
		return path.join(this.getPath(), this.getBundleConfig().get('output').css);
	}

	getSourceDirectoryPath(): string
	{
		return path.join(this.getPath(), 'src');
	}

	getSourceFiles(): Array<string>
	{
		return this.#cache.remember('sourceFiles', () => {
			return fg.sync(
				BasePackage.SOURCE_FILES_PATTERN,
				{
					cwd: this.getSourceDirectoryPath(),
					dot: true,
					onlyFiles: true,
					unique: true,
					absolute: true,
				},
			);
		});
	}

	getJavaScriptSourceFiles(): Array<string>
	{
		return this.#cache.remember('javaScriptSourceFiles', () => {
			return this.getSourceFiles().filter((sourceFile) => {
				return sourceFile.endsWith(`.${BasePackage.JAVASCRIPT_EXTENSION}`);
			});
		});
	}

	getTypeScriptSourceFiles(): Array<string>
	{
		return this.#cache.remember('typeScriptSourceFiles', () => {
			return this.getSourceFiles().filter((sourceFile) => {
				return sourceFile.endsWith(`.${BasePackage.TYPESCRIPT_EXTENSION}`);
			});
		});
	}

	getActualSourceFiles(): Array<string>
	{
		if (this.isTypeScriptMode())
		{
			return this.getTypeScriptSourceFiles();
		}

		return this.getJavaScriptSourceFiles();
	}

	isTypeScriptMode(): boolean
	{
		return this.getInputPath().endsWith('.ts');
	}

	// endregion

	// region Test paths

	getUnitTestsDirectoryPath(): string
	{
		const unitDir = path.join(this.getPath(), 'test', 'unit');
		if (fs.existsSync(unitDir))
		{
			return unitDir;
		}

		// Fallback for legacy structure
		return path.join(this.getPath(), 'test');
	}

	getEndToEndTestsDirectoryPath(): string
	{
		return path.join(this.getPath(), 'test', 'e2e');
	}

	async getUnitTests(): Promise<Array<string>>
	{
		const patterns = [
			'**/*.test.js',
			'**/*.test.ts',
		];

		// Exclude e2e only for legacy test structure (tests in test/ root)
		if (!fs.existsSync(path.join(this.getPath(), 'test', 'unit')))
		{
			patterns.push('!**/e2e');
		}

		return fg.async(
			patterns,
			{
				cwd: this.getUnitTestsDirectoryPath(),
				dot: true,
				onlyFiles: true,
				unique: true,
				absolute: true,
			},
		);
	}

	async getEndToEndTests(): Promise<Array<string>>
	{
		const patterns = [
			'**/*.test.js',
			'**/*.test.ts',
			'**/*.spec.js',
			'**/*.spec.ts',
		];

		return fg.async(
			patterns,
			{
				cwd: this.getEndToEndTestsDirectoryPath(),
				dot: true,
				onlyFiles: true,
				unique: true,
				absolute: true,
			},
		);
	}

	// endregion

	// region Dependencies

	async getDependencies(): Promise<Array<DependencyNode>>
	{
		return this.#cache.remember('dependencies', async () => {
			const phpConfig = this.getPhpConfig();
			if (phpConfig)
			{
				const rel = phpConfig.get('rel');
				if (Array.isArray(rel))
				{
					return rel.map((name: string) => {
						return { name };
					});
				}
			}

			if (this.hasBundleConfigJsFile())
			{
				const { PackageBuilder } = await import('../services/package-builder');
				const buildEngine = await PackageBuilder.getBuildEngine();
				const buildResult = await buildEngine.build({
					input: this.getInputPath(),
					output: { js: this.getOutputJsPath(), css: this.getOutputCssPath() },
					packageRoot: this.getPath(),
					publicPath: this.getPublicPath(),
					targets: this.getTargets(),
					namespace: this.getBundleConfig().get('namespace'),
				});

				return buildResult.dependencies.map((name: string) => {
					return { name };
				});
			}

			return [];
		});
	}

	async getDependenciesTree(options: { size?: boolean, unique?: boolean } = {}): Promise<Array<DependencyNode>>
	{
		return this.#cache.remember(`dependenciesTree+${options.size}+${options.unique}`, () => {
			return buildDependenciesTree({
				target: this,
				...options,
			});
		});
	}

	async getFlattedDependenciesTree(unique: boolean = true): Promise<Array<DependencyNode>>
	{
		return this.#cache.remember(`flattedDependenciesTree+${unique}`, async () => {
			return flattenTree(await this.getDependenciesTree(), unique);
		});
	}

	// endregion

	// region Actions (delegate to services)

	async build(options: { production?: boolean } = {}): Promise<BuildResult>
	{
		const { PackageBuilder } = await import('../services/package-builder');
		return new PackageBuilder(this).build(options);
	}

	async generate(options: { production?: boolean } = {}): Promise<BuildResult>
	{
		const { PackageBuilder } = await import('../services/package-builder');
		return new PackageBuilder(this).generate(options);
	}

	async lint(): Promise<LintResult>
	{
		const { PackageLinter } = await import('../services/package-linter');
		return new PackageLinter(this).lint();
	}

	async runUnitTests(args: Record<string, any> = {}): Promise<any>
	{
		const { PackageTestRunner } = await import('../services/package-test-runner');
		return new PackageTestRunner(this).runUnitTests(args);
	}

	async runEndToEndTests(args: Record<string, any> = {}): Promise<any>
	{
		const { PackageTestRunner } = await import('../services/package-test-runner');
		return new PackageTestRunner(this).runEndToEndTests(args);
	}

	getBundlesSize(): { css: number, js: number }
	{
		return this.#cache.remember('bundleSize', () => {
			return new PackageSizeCalculator(this).getBundlesSize();
		});
	}

	async getDependenciesSize(): Promise<{ js: number, css: number }>
	{
		return this.#cache.remember('getDependenciesSize', () => {
			return new PackageSizeCalculator(this).getDependenciesSize();
		});
	}

	async getTotalTransferredSize(): Promise<{ css: number, js: number }>
	{
		return new PackageSizeCalculator(this).getTotalTransferredSize();
	}

	// endregion
}
