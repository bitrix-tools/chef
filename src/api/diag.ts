import { findCircularDependencies } from '../utils/package/find-circular-dependencies';
import { CF } from '../diagnostics/diagnostic-codes';

import { createSnapshot } from '../commands/diag/package-snapshot';
import { analyzePopular } from '../commands/diag/analyzers/popular-analyzer';
import { analyzeHeavyDeps } from '../commands/diag/analyzers/heavy-deps-analyzer';
import { analyzeHeavyBundles } from '../commands/diag/analyzers/heavy-bundles-analyzer';
import { analyzeUnusedDeps } from '../commands/diag/analyzers/unused-deps-analyzer';
import { findCircularImports } from '../commands/diag/analyzers/circular-imports-analyzer';

import { initializeEnvironment } from './initialize-environment';
import { toErrorPayload } from './to-error-payload';
import { resolveTargets, validateTargetSelector, type TargetSelector } from './resolve-targets';

import type { PackageSnapshot, SnapshotField } from '../commands/diag/package-snapshot';
import type { BasePackage } from '../modules/packages/base-package';
import type { PopularResult } from '../commands/diag/analyzers/popular-analyzer';
import type { HeavyDepsResult } from '../commands/diag/analyzers/heavy-deps-analyzer';
import type { HeavyBundlesResult, HeavyBundlesSortKey } from '../commands/diag/analyzers/heavy-bundles-analyzer';
import type { UnusedDepsResult } from '../commands/diag/analyzers/unused-deps-analyzer';
import type { BaseApiOptions, ChefDataResult } from './types';

export type DiagBaseOptions = BaseApiOptions & TargetSelector;

async function collectSnapshots(
	options: DiagBaseOptions,
	fields: Set<SnapshotField>,
): Promise<PackageSnapshot[]>
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

	return snapshots;
}

function withEnvironment<T>(options: DiagBaseOptions, command: string, run: () => Promise<T>): Promise<ChefDataResult<T>>
{
	const startedAt = Date.now();
	const cwd = options.cwd ?? process.cwd();

	const selectorError = validateTargetSelector(options);
	if (selectorError)
	{
		return Promise.resolve({
			ok: false,
			command,
			error: selectorError,
			durationMs: Date.now() - startedAt,
		});
	}

	const envError = initializeEnvironment(cwd);
	if (envError)
	{
		return Promise.resolve({
			ok: false,
			command,
			error: envError,
			durationMs: Date.now() - startedAt,
		});
	}

	return run().then(
		(data) => ({
			ok: true,
			command,
			data,
			durationMs: Date.now() - startedAt,
		}),
		(error) => ({
			ok: false,
			command,
			error: toErrorPayload(error, CF.PACKAGE_READ_ERROR),
			durationMs: Date.now() - startedAt,
		}),
	);
}

async function inspectExtensions<TItem>(
	options: DiagBaseOptions,
	inspect: (extensionPackage: BasePackage) => Promise<TItem | null>,
): Promise<TItem[]>
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

	return items;
}

export type TopUsedOptions = DiagBaseOptions & { limit?: number };
export type TopUsedItem = PopularResult;

export function topUsed(options: TopUsedOptions = {}): Promise<ChefDataResult<TopUsedItem[]>>
{
	return withEnvironment(options, 'diag.top-used', async () => {
		const snapshots = await collectSnapshots(options, new Set<SnapshotField>(['dependencies']));
		return analyzePopular(snapshots, options.limit ?? Infinity);
	});
}

export type TopDepsOptions = DiagBaseOptions & { limit?: number };
export type TopDepsItem = HeavyDepsResult;

export function topDeps(options: TopDepsOptions = {}): Promise<ChefDataResult<TopDepsItem[]>>
{
	return withEnvironment(options, 'diag.top-deps', async () => {
		const snapshots = await collectSnapshots(options, new Set<SnapshotField>(['dependencies']));
		return analyzeHeavyDeps(snapshots, options.limit ?? Infinity);
	});
}

export type TopBundleSizeOptions = DiagBaseOptions & {
	limit?: number,
	sortBy?: HeavyBundlesSortKey,
};
export type TopBundleSizeItem = HeavyBundlesResult;

export function topBundleSize(options: TopBundleSizeOptions = {}): Promise<ChefDataResult<TopBundleSizeItem[]>>
{
	return withEnvironment(options, 'diag.top-bundle-size', async () => {
		const snapshots = await collectSnapshots(options, new Set<SnapshotField>(['bundleSize', 'assetsSize']));
		return analyzeHeavyBundles(snapshots, options.limit ?? Infinity, options.sortBy ?? 'total');
	});
}

export type UnusedDepsApiOptions = DiagBaseOptions & { limit?: number };
export type UnusedDepsItem = UnusedDepsResult;

export function unusedDeps(options: UnusedDepsApiOptions = {}): Promise<ChefDataResult<UnusedDepsItem[]>>
{
	return withEnvironment(options, 'diag.unused-deps', async () => {
		const snapshots = await collectSnapshots(
			options,
			new Set<SnapshotField>(['dependencies', 'importedExtensions', 'exportedGlobals']),
		);
		return analyzeUnusedDeps(snapshots, options.limit ?? Infinity);
	});
}

export type CircularDepsItem = {
	name: string,
	cycles: string[][],
};

export function circularDeps(options: DiagBaseOptions = {}): Promise<ChefDataResult<CircularDepsItem[]>>
{
	return withEnvironment(options, 'diag.circular-deps', () => {
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

export type CircularImportsItem = {
	name: string,
	cycles: string[][],
};

export function circularImports(options: DiagBaseOptions = {}): Promise<ChefDataResult<CircularImportsItem[]>>
{
	return withEnvironment(options, 'diag.circular-imports', () => {
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

export const diag = {
	topUsed,
	topDeps,
	topBundleSize,
	unusedDeps,
	circularDeps,
	circularImports,
};
