import { findCircularDependencies } from '../../utils/package/find-circular-dependencies';
import { CF } from '../../diagnostics/diagnostic-codes';
import { Environment } from '../../environment/environment';
import { PackageResolver } from '../../modules/packages/package-resolver';

import { createSnapshot, findExportedGlobals } from '../../commands/diag/package-snapshot';
import { analyzePopular } from '../../commands/diag/analyzers/popular-analyzer';
import { analyzeHeavyDeps } from '../../commands/diag/analyzers/heavy-deps-analyzer';
import { analyzeDeepDeps } from '../../commands/diag/analyzers/deep-deps-analyzer';
import { analyzeHeavyBundles } from '../../commands/diag/analyzers/heavy-bundles-analyzer';
import { analyzeHeavyTotal } from '../../commands/diag/analyzers/heavy-total-analyzer';
import { analyzeUnusedDeps } from '../../commands/diag/analyzers/unused-deps-analyzer';
import { analyzeOrphans } from '../../commands/diag/analyzers/orphan-analyzer';
import { analyzeConfig, analyzeConfigExcept, analyzeConfigMissing } from '../../commands/diag/analyzers/config-analyzer';
import { findCircularImports } from '../../commands/diag/analyzers/circular-imports-analyzer';
import { findUsages } from '../../commands/diag/analyzers/find-usages-analyzer';
import { findDependencyPath } from '../../commands/diag/analyzers/deps-path-analyzer';
import { flattenTree } from '../../utils/flatten-tree';

import { buildMeta } from './meta';
import { initializeEnvironment } from './initialize-environment';
import { toErrorPayload } from './to-error-payload';
import { resolveTargets, validateTargetSelector, type TargetSelector } from './resolve-targets';

import type { PackageSnapshot, SnapshotField } from '../../commands/diag/package-snapshot';
import type { BasePackage } from '../../modules/packages/base-package';
import type { DependencyNode } from '../../modules/packages/types/dependency-node';
import type { PopularResult } from '../../commands/diag/analyzers/popular-analyzer';
import type { HeavyDepsResult } from '../../commands/diag/analyzers/heavy-deps-analyzer';
import type { DeepDepsResult } from '../../commands/diag/analyzers/deep-deps-analyzer';
import type { HeavyBundlesResult, HeavyBundlesSortKey } from '../../commands/diag/analyzers/heavy-bundles-analyzer';
import type { HeavyTotalResult, HeavyTotalSortKey } from '../../commands/diag/analyzers/heavy-total-analyzer';
import type { UnusedDepsResult } from '../../commands/diag/analyzers/unused-deps-analyzer';
import type { ConfigResult, ConfigExceptResult, ConfigMissingResult } from '../../commands/diag/analyzers/config-analyzer';
import type { UsageLocation } from '../../commands/diag/analyzers/find-usages-analyzer';
import type { JsonInputOptions, JsonReportResult } from './types';

export type DiagBaseOptions = JsonInputOptions & TargetSelector;

export type ListDiagData<TItem> = {
	scanned: number,
	results: TItem[],
};

type CollectedSnapshots = {
	snapshots: PackageSnapshot[],
	scanned: number,
};

async function collectSnapshots(
	options: DiagBaseOptions,
	fields: Set<SnapshotField>,
): Promise<CollectedSnapshots>
{
	const { found } = await resolveTargets(options);

	const snapshots: PackageSnapshot[] = [];
	await Promise.all(found.map(async (extensionPackage) => {
		try
		{
			snapshots.push(await createSnapshot(extensionPackage, fields));
		}
		catch
		{
			// Skip extensions that fail to snapshot
		}
	}));

	return { snapshots, scanned: found.length };
}

function withEnvironment<T>(
	options: DiagBaseOptions,
	command: string,
	emptyData: T,
	run: () => Promise<T>,
): Promise<JsonReportResult<T>>
{
	const startedAt = Date.now();
	const cwd = options.cwd ?? process.cwd();
	const meta = buildMeta(cwd);

	const selectorError = validateTargetSelector(options);
	if (selectorError)
	{
		return Promise.resolve({
			...meta,
			success: false,
			command,
			data: emptyData,
			error: selectorError,
			durationMs: Date.now() - startedAt,
		});
	}

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return Promise.resolve({
			...meta,
			success: false,
			command,
			data: emptyData,
			error: envError,
			durationMs: Date.now() - startedAt,
		});
	}

	return run().then(
		(data) => ({
			...meta,
			success: true,
			command,
			data,
			durationMs: Date.now() - startedAt,
		}),
		(error) => ({
			...meta,
			success: false,
			command,
			data: emptyData,
			error: toErrorPayload(error, CF.PACKAGE_READ_ERROR),
			durationMs: Date.now() - startedAt,
		}),
	);
}

type Inspected<TItem> = {
	scanned: number,
	results: TItem[],
};

async function inspectExtensions<TItem>(
	options: DiagBaseOptions,
	inspect: (extensionPackage: BasePackage) => Promise<TItem | null>,
): Promise<Inspected<TItem>>
{
	const { found } = await resolveTargets(options);
	const items: TItem[] = [];

	await Promise.all(found.map(async (extensionPackage) => {
		try
		{
			const item = await inspect(extensionPackage);
			if (item !== null)
			{
				items.push(item);
			}
		}
		catch
		{
			// Skip extensions that fail to inspect
		}
	}));

	return { scanned: found.length, results: items };
}

const emptyList = <T>(): ListDiagData<T> => ({ scanned: 0, results: [] });

// region: top-used

export type TopUsedOptions = DiagBaseOptions & { limit?: number };
export type TopUsedItem = PopularResult;
export type TopUsedData = ListDiagData<TopUsedItem>;

export function topUsed(options: TopUsedOptions = {}): Promise<JsonReportResult<TopUsedData>>
{
	return withEnvironment(options, 'diag.top-used', emptyList<TopUsedItem>(), async () => {
		const { snapshots, scanned } = await collectSnapshots(options, new Set<SnapshotField>(['dependencies']));
		return { scanned, results: analyzePopular(snapshots, options.limit ?? Infinity) };
	});
}

// endregion

// region: top-deps

export type TopDepsOptions = DiagBaseOptions & { limit?: number };
export type TopDepsItem = HeavyDepsResult;
export type TopDepsData = ListDiagData<TopDepsItem>;

export function topDeps(options: TopDepsOptions = {}): Promise<JsonReportResult<TopDepsData>>
{
	return withEnvironment(options, 'diag.top-deps', emptyList<TopDepsItem>(), async () => {
		const { snapshots, scanned } = await collectSnapshots(options, new Set<SnapshotField>(['dependencies']));
		return { scanned, results: analyzeHeavyDeps(snapshots, options.limit ?? Infinity) };
	});
}

// endregion

// region: top-bundle-size

export type TopBundleSizeOptions = DiagBaseOptions & {
	limit?: number,
	sortBy?: HeavyBundlesSortKey,
};
export type TopBundleSizeItem = HeavyBundlesResult;
export type TopBundleSizeData = ListDiagData<TopBundleSizeItem> & { sortBy: HeavyBundlesSortKey };

export function topBundleSize(options: TopBundleSizeOptions = {}): Promise<JsonReportResult<TopBundleSizeData>>
{
	const sortBy: HeavyBundlesSortKey = options.sortBy ?? 'total';
	const empty: TopBundleSizeData = { scanned: 0, results: [], sortBy };
	return withEnvironment(options, 'diag.top-bundle-size', empty, async () => {
		const { snapshots, scanned } = await collectSnapshots(options, new Set<SnapshotField>(['bundleSize', 'assetsSize']));
		return { scanned, sortBy, results: analyzeHeavyBundles(snapshots, options.limit ?? Infinity, sortBy) };
	});
}

// endregion

// region: unused-deps

export type UnusedDepsApiOptions = DiagBaseOptions & { limit?: number };
export type UnusedDepsItem = UnusedDepsResult;
export type UnusedDepsData = ListDiagData<UnusedDepsItem>;

export function unusedDeps(options: UnusedDepsApiOptions = {}): Promise<JsonReportResult<UnusedDepsData>>
{
	return withEnvironment(options, 'diag.unused-deps', emptyList<UnusedDepsItem>(), async () => {
		const { snapshots, scanned } = await collectSnapshots(
			options,
			new Set<SnapshotField>(['dependencies', 'importedExtensions', 'exportedGlobals']),
		);
		return { scanned, results: analyzeUnusedDeps(snapshots, options.limit ?? Infinity) };
	});
}

// endregion

// region: circular-deps

export type CircularDepsItem = {
	name: string,
	cycles: string[][],
};
export type CircularDepsData = ListDiagData<CircularDepsItem>;

export function circularDeps(options: DiagBaseOptions = {}): Promise<JsonReportResult<CircularDepsData>>
{
	return withEnvironment(options, 'diag.circular-deps', emptyList<CircularDepsItem>(), async () => {
		return inspectExtensions(options, async (extensionPackage) => {
			const cycles = await findCircularDependencies({ target: extensionPackage });
			if (cycles.length === 0)
			{
				return null;
			}
			return { name: extensionPackage.getName(), cycles };
		});
	});
}

// endregion

// region: circular-imports

export type CircularImportsItem = {
	name: string,
	cycles: string[][],
};
export type CircularImportsData = ListDiagData<CircularImportsItem>;

export function circularImports(options: DiagBaseOptions = {}): Promise<JsonReportResult<CircularImportsData>>
{
	return withEnvironment(options, 'diag.circular-imports', emptyList<CircularImportsItem>(), async () => {
		return inspectExtensions(options, async (extensionPackage) => {
			const sourceFiles = extensionPackage.getSourceFiles();
			const cycles = await findCircularImports(sourceFiles, extensionPackage.getPath());
			if (cycles.length === 0)
			{
				return null;
			}
			return { name: extensionPackage.getName(), cycles };
		});
	});
}

// endregion

// region: top-deps-tree

export type TopDepsTreeOptions = DiagBaseOptions & { limit?: number };
export type TopDepsTreeItem = DeepDepsResult;
export type TopDepsTreeData = ListDiagData<TopDepsTreeItem>;

export function topDepsTree(options: TopDepsTreeOptions = {}): Promise<JsonReportResult<TopDepsTreeData>>
{
	return withEnvironment(options, 'diag.top-deps-tree', emptyList<TopDepsTreeItem>(), async () => {
		const { snapshots, scanned } = await collectSnapshots(options, new Set<SnapshotField>(['dependencyTreeSize']));
		return { scanned, results: analyzeDeepDeps(snapshots, options.limit ?? Infinity) };
	});
}

// endregion

// region: top-total-size

export type TopTotalSizeOptions = DiagBaseOptions & {
	limit?: number,
	sortBy?: HeavyTotalSortKey,
};
export type TopTotalSizeItem = HeavyTotalResult;
export type TopTotalSizeData = ListDiagData<TopTotalSizeItem> & { sortBy: HeavyTotalSortKey };

export function topTotalSize(options: TopTotalSizeOptions = {}): Promise<JsonReportResult<TopTotalSizeData>>
{
	const sortBy: HeavyTotalSortKey = options.sortBy ?? 'total';
	const empty: TopTotalSizeData = { scanned: 0, results: [], sortBy };
	return withEnvironment(options, 'diag.top-total-size', empty, async () => {
		const { snapshots, scanned } = await collectSnapshots(
			options,
			new Set<SnapshotField>(['bundleSize', 'assetsSize', 'totalSize', 'dependencies', 'dependencyTreeSize']),
		);
		return { scanned, sortBy, results: analyzeHeavyTotal(snapshots, options.limit ?? Infinity, sortBy) };
	});
}

// endregion

// region: unused

export type UnusedOptions = DiagBaseOptions;
export type UnusedItem = { name: string };
export type UnusedData = ListDiagData<UnusedItem>;

export function unused(options: UnusedOptions = {}): Promise<JsonReportResult<UnusedData>>
{
	return withEnvironment(options, 'diag.unused', emptyList<UnusedItem>(), async () => {
		const { snapshots, scanned } = await collectSnapshots(options, new Set<SnapshotField>(['dependencies']));
		const startDirectory = options.path ?? Environment.getRoot() ?? process.cwd();
		const orphans = await analyzeOrphans(snapshots, startDirectory);
		return { scanned, results: orphans };
	});
}

// endregion

// region: find-usages

export type FindUsagesOptions = JsonInputOptions & {
	extension: string,
	path?: string,
};

export type FindUsagesItem = {
	type: UsageLocation['type'],
	file: string,
	line: number,
	content: string,
};

export type FindUsagesData = {
	extension: string,
	usages: FindUsagesItem[],
};

const emptyFindUsages = (extension: string): FindUsagesData => ({ extension, usages: [] });

export function findUsagesApi(options: FindUsagesOptions): Promise<JsonReportResult<FindUsagesData>>
{
	const empty = emptyFindUsages(options.extension);
	return withEnvironment(options, 'diag.find-usages', empty, async () => {
		const startDirectory = options.path ?? Environment.getRoot() ?? process.cwd();
		const extension: BasePackage | null = PackageResolver.resolve(options.extension);
		const globals = extension ? await findExportedGlobals(extension) : new Set<string>();
		const usages = await findUsages(options.extension, extension, globals, startDirectory);

		return {
			extension: options.extension,
			usages: usages.map((usage) => ({
				type: usage.type,
				file: usage.file,
				line: usage.line,
				content: usage.content,
			})),
		};
	});
}

// endregion

// region: deps-tree

export type DepsTreeOptions = JsonInputOptions & {
	extension: string,
	flat?: boolean,
	depth?: number,
	why?: string,
};

export type DepsTreeData =
	| { mode: 'tree', extension: string, uniqueCount: number, tree: DependencyNode[] }
	| { mode: 'flat', extension: string, uniqueCount: number, dependencies: string[] }
	| { mode: 'why', extension: string, target: string, path: string[] | null }
	| { mode: 'not-found', extension: string };

const emptyDepsTree = (extension: string): DepsTreeData => ({ mode: 'not-found', extension });

export function depsTree(options: DepsTreeOptions): Promise<JsonReportResult<DepsTreeData>>
{
	const empty = emptyDepsTree(options.extension);
	return withEnvironment(options, 'diag.deps-tree', empty, async () => {
		const extension: BasePackage | null = PackageResolver.resolve(options.extension);
		if (!extension)
		{
			return { mode: 'not-found' as const, extension: options.extension };
		}

		const tree = await extension.getDependenciesTree();
		const flatDeps = flattenTree(tree, true);

		if (options.why !== undefined)
		{
			const path = findDependencyPath(tree, options.why);
			return {
				mode: 'why' as const,
				extension: options.extension,
				target: options.why,
				path: path ?? null,
			};
		}

		if (options.flat)
		{
			return {
				mode: 'flat' as const,
				extension: options.extension,
				uniqueCount: flatDeps.length,
				dependencies: flatDeps.map((node) => node.name).sort(),
			};
		}

		return {
			mode: 'tree' as const,
			extension: options.extension,
			uniqueCount: flatDeps.length,
			tree,
		};
	});
}

// endregion

// region: bundle-size

export type BundleSizeOptions = JsonInputOptions & {
	extension: string,
	withDeps?: boolean,
};

type SizeBlock = { js: number, css: number, assets: number, total: number };

export type BundleSizeData =
	| {
		extension: string,
		own: SizeBlock,
		dependencies?: SizeBlock & { count: number },
		total?: number,
	}
	| { extension: string, notFound: true };

const emptyBundleSize = (extension: string): BundleSizeData => ({ extension, notFound: true });

export function bundleSize(options: BundleSizeOptions): Promise<JsonReportResult<BundleSizeData>>
{
	const empty = emptyBundleSize(options.extension);
	return withEnvironment(options, 'diag.bundle-size', empty, async () => {
		const extension: BasePackage | null = PackageResolver.resolve(options.extension);
		if (!extension)
		{
			return { extension: options.extension, notFound: true as const };
		}

		const ownSize = extension.getBundlesSize();
		const ownAssets = extension.getAssetsSize();
		const own: SizeBlock = {
			js: ownSize.js,
			css: ownSize.css,
			assets: ownAssets,
			total: ownSize.js + ownSize.css + ownAssets,
		};

		if (!options.withDeps)
		{
			return { extension: options.extension, own };
		}

		const flatDeps = await extension.getFlattedDependenciesTree();
		let depsJs = 0;
		let depsCss = 0;
		let depsAssets = 0;

		for (const dep of flatDeps)
		{
			const depExtension = PackageResolver.resolve(dep.name);
			if (depExtension)
			{
				const depSize = depExtension.getBundlesSize();
				depsJs += depSize.js;
				depsCss += depSize.css;
				depsAssets += depExtension.getAssetsSize();
			}
		}

		const dependencies = {
			count: flatDeps.length,
			js: depsJs,
			css: depsCss,
			assets: depsAssets,
			total: depsJs + depsCss + depsAssets,
		};

		return {
			extension: options.extension,
			own,
			dependencies,
			total: own.total + dependencies.total,
		};
	});
}

// endregion

// region: config

export type ConfigMode = 'match' | 'except' | 'missing';

export type ConfigOptions = DiagBaseOptions & {
	keys: string[],
	value?: string,
	except?: boolean,
	missing?: boolean,
};

export type ConfigData =
	| {
		mode: 'match',
		scanned: number,
		keys: string[],
		value: string | null,
		results: ConfigResult[],
	}
	| {
		mode: 'except',
		scanned: number,
		keys: string[],
		results: ConfigExceptResult[],
	}
	| {
		mode: 'missing',
		scanned: number,
		keys: string[],
		results: ConfigMissingResult[],
	};

function emptyConfig(options: ConfigOptions): ConfigData
{
	if (options.missing)
	{
		return { mode: 'missing', scanned: 0, keys: options.keys, results: [] };
	}
	if (options.except)
	{
		return { mode: 'except', scanned: 0, keys: options.keys, results: [] };
	}
	return { mode: 'match', scanned: 0, keys: options.keys, value: options.value ?? null, results: [] };
}

export function config(options: ConfigOptions): Promise<JsonReportResult<ConfigData>>
{
	return withEnvironment(options, 'diag.config', emptyConfig(options), async () => {
		const { snapshots, scanned } = await collectSnapshots(options, new Set<SnapshotField>(['bundleConfig']));

		if (options.missing)
		{
			return {
				mode: 'missing' as const,
				scanned,
				keys: options.keys,
				results: analyzeConfigMissing(snapshots, options.keys),
			};
		}

		if (options.except)
		{
			return {
				mode: 'except' as const,
				scanned,
				keys: options.keys,
				results: analyzeConfigExcept(snapshots, new Set(options.keys)),
			};
		}

		return {
			mode: 'match' as const,
			scanned,
			keys: options.keys,
			value: options.value ?? null,
			results: analyzeConfig(snapshots, options.keys, options.value),
		};
	});
}

// endregion

export const diag = {
	topUsed,
	topDeps,
	topDepsTree,
	topBundleSize,
	topTotalSize,
	unusedDeps,
	unused,
	circularDeps,
	circularImports,
	findUsages: findUsagesApi,
	depsTree,
	bundleSize,
	config,
};
