import { readFile } from 'node:fs/promises';

import { PackageResolver } from '../modules/packages/package-resolver';
import { PackageSizeCalculator } from '../modules/services/package-size-calculator';
import { findCircularDependencies as findCircularDependenciesUtil } from '../utils/package/find-circular-dependencies';
import { findCircularImports as findCircularImportsUtil } from '../commands/diag/analyzers/circular-imports-analyzer';
import { stripComments } from '../commands/diag/analyzers/file-scanner';
import { createSnapshot } from '../commands/diag/package-snapshot';

import { buildSinglePackage, type BuildSingleOptions, type BuildExtensionResult } from './build';
import { lintSinglePackage, type LintSingleOptions, type LintExtensionResult } from './lint';
import { testSinglePackage, type TestSingleOptions, type TestExtensionResult } from './test';
import { typecheckSinglePackage, type TypecheckSingleOptions, type TypecheckExtensionResult } from './typecheck';

import type { BasePackage } from '../modules/packages/base-package';
import type { BundleConfigManager } from '../modules/config/bundle/bundle-config-manager';
import type { PhpConfigManager } from '../modules/config/php/php-config-manager';
import type { DependencyNode } from '../modules/packages/types/dependency-node';
import type { PackageSnapshot, SnapshotField } from '../commands/diag/package-snapshot';

export type PackageBundleSize = {
	js: number,
	css: number,
	assets: number,
	total: number,
};

export type DependencySizeInfo = {
	name: string,
	js: number,
	css: number,
	assets: number,
	total: number,
};

export type HeaviestDependenciesOptions = {
	limit?: number,
	sortBy?: 'total' | 'js' | 'css' | 'assets',
};

export class Package
{
	readonly #base: BasePackage;

	constructor(basePackage: BasePackage)
	{
		this.#base = basePackage;
	}

	// region: identity

	getName(): string
	{
		return this.#base.getName();
	}

	getPath(): string
	{
		return this.#base.getPath();
	}

	getModuleName(): string
	{
		return this.#base.getModuleName();
	}

	getNamespace(): string
	{
		return this.#base.getBundleConfig().get('namespace') ?? '';
	}

	isTypeScript(): boolean
	{
		return this.#base.isTypeScriptMode();
	}

	// endregion

	// region: file paths

	getInputPath(): string
	{
		return this.#base.getInputPath();
	}

	getOutputJsPath(): string
	{
		return this.#base.getOutputJsPath();
	}

	getOutputCssPath(): string
	{
		return this.#base.getOutputCssPath();
	}

	getSourceFiles(): string[]
	{
		return this.#base.getSourceFiles();
	}

	// endregion

	// region: configs

	getBundleConfig(): BundleConfigManager
	{
		return this.#base.getBundleConfig();
	}

	getPhpConfig(): PhpConfigManager
	{
		return this.#base.getPhpConfig();
	}

	// endregion

	// region: dependencies

	async getDependencies(): Promise<string[]>
	{
		const nodes = await this.#base.getDependencies();
		return nodes.map((node) => node.name);
	}

	getDependenciesTree(options: { withSize?: boolean } = {}): Promise<DependencyNode[]>
	{
		return this.#base.getDependenciesTree({ size: options.withSize });
	}

	getFlattenedDependencies(options: { unique?: boolean } = {}): Promise<DependencyNode[]>
	{
		return this.#base.getFlattedDependenciesTree(options.unique ?? true);
	}

	async getDependenciesTreeSize(): Promise<number>
	{
		const tree = await this.#base.getFlattedDependenciesTree(true);
		return tree.length;
	}

	// endregion

	// region: tests

	hasUnitTests(): Promise<boolean>
	{
		return this.#base.hasUnitTests();
	}

	hasEndToEndTests(): Promise<boolean>
	{
		return this.#base.hasEndToEndTests();
	}

	// endregion

	// region: sizes

	getBundleSize(): PackageBundleSize
	{
		const { js, css } = this.#base.getBundlesSize();
		const assets = this.#base.getAssetsSize();

		return { js, css, assets, total: js + css + assets };
	}

	getDependenciesSize(): Promise<{ js: number, css: number, assets: number }>
	{
		return this.#base.getDependenciesSize();
	}

	async getTotalTransferredSize(): Promise<PackageBundleSize>
	{
		const { js, css, assets } = await this.#base.getTotalTransferredSize();
		return { js, css, assets, total: js + css + assets };
	}

	async getHeaviestDependencies(options: HeaviestDependenciesOptions = {}): Promise<DependencySizeInfo[]>
	{
		const limit = options.limit ?? Infinity;
		const sortBy = options.sortBy ?? 'total';

		const tree = await this.#base.getFlattedDependenciesTree(true);
		const items: DependencySizeInfo[] = [];

		for (const node of tree)
		{
			const extension = PackageResolver.resolve(node.name);
			if (!extension)
			{
				continue;
			}

			const calculator = new PackageSizeCalculator(extension);
			const { js, css } = calculator.getBundlesSize();
			const assets = calculator.getAssetsSize();

			items.push({
				name: node.name,
				js,
				css,
				assets,
				total: js + css + assets,
			});
		}

		return items
			.filter((item) => item.total > 0)
			.sort((a, b) => b[sortBy] - a[sortBy])
			.slice(0, limit);
	}

	// endregion

	// region: inspections

	findCircularDependencies(): Promise<string[][]>
	{
		return findCircularDependenciesUtil({ target: this.#base });
	}

	async findCircularImports(): Promise<string[][]>
	{
		return findCircularImportsUtil(this.#base.getSourceFiles(), this.#base.getPath());
	}

	async findUnusedDependencies(): Promise<string[]>
	{
		const declared = await this.getDependencies();
		if (declared.length === 0)
		{
			return [];
		}

		const imported = new Set<string>();
		for (const file of this.#base.getSourceFiles())
		{
			let content: string;
			try
			{
				content = await readFile(file, 'utf-8');
			}
			catch
			{
				continue;
			}

			const code = stripComments(content);
			const importPattern = /(?:from\s+|import\s+)['"]([a-z][a-z0-9._-]+)['"]/g;
			for (const match of code.matchAll(importPattern))
			{
				imported.add(match[1]);
			}
		}

		return declared.filter((name) => !imported.has(name));
	}

	// endregion

	// region: snapshot

	snapshot(fields: SnapshotField[]): Promise<PackageSnapshot>
	{
		return createSnapshot(this.#base, new Set(fields));
	}

	// endregion

	// region: actions

	build(options: BuildSingleOptions = {}): Promise<BuildExtensionResult>
	{
		return buildSinglePackage(this.#base, options);
	}

	lint(options: LintSingleOptions = {}): Promise<LintExtensionResult>
	{
		return lintSinglePackage(this.#base, options);
	}

	test(options: TestSingleOptions = {}): Promise<TestExtensionResult>
	{
		return testSinglePackage(this.#base, options);
	}

	typecheck(options: TypecheckSingleOptions = {}): Promise<TypecheckExtensionResult>
	{
		return typecheckSinglePackage(this.#base, options);
	}

	// endregion
}
