import type { UsageLocation, UsageType } from './find-usages-analyzer';

export type UsageFilter = {
	imports?: string;
	namespace?: string;
	kinds?: UsageType[];
};

export function filterUsages(usages: UsageLocation[], filter: UsageFilter): UsageLocation[]
{
	if (!filter.imports && !filter.namespace && !filter.kinds)
	{
		return usages;
	}

	return usages.filter((u) => {
		if (filter.kinds && !filter.kinds.includes(u.type))
		{
			return false;
		}

		if (filter.imports !== undefined)
		{
			if (u.type !== 'js-import')
			{
				return false;
			}

			const names = u.details?.imports ?? [];
			if (filter.imports === '(side-effect)')
			{
				return names.length === 0;
			}

			if (!names.includes(filter.imports))
			{
				return false;
			}
		}

		if (filter.namespace !== undefined)
		{
			if (u.type !== 'js-namespace' && u.type !== 'js-inheritance')
			{
				return false;
			}

			const ns = u.details?.namespace ?? u.details?.inheritedFrom;
			if (!ns)
			{
				return false;
			}

			if (ns !== filter.namespace && !ns.startsWith(`${filter.namespace}.`))
			{
				return false;
			}
		}

		return true;
	});
}

export type CountedLocation = {
	file: string;
	line: number;
};

export type CountedItem = {
	name: string;
	files: number;
	locations: CountedLocation[];
};

export type FindUsagesSummary = {
	totalUsages: number;
	totalFiles: number;
	totalModules: number;
	byType: Partial<Record<UsageType, number>>;
	/** Per-type list of locations (one entry per file, earliest line) — used to
	 * render concrete `at /path:line` pointers for types without a breakdown
	 * (load-extension, dynamic import). */
	locationsByType: Partial<Record<UsageType, CountedLocation[]>>;
	imports: CountedItem[];
	namespaces: CountedItem[];
	inheritance: CountedItem[];
	topModules: CountedItem[];
};

/**
 * Compute aggregates from a flat list of usages. File counts are de-duplicated
 * per category — one file with three `BX.UI.Notification.Center` calls counts
 * as 1 in the namespace breakdown, not 3. This matches the user mental model
 * of "how many files would I need to touch".
 */
type Bucket = Map<string, Map<string, number>>; // key → (file → first line)

export function summarizeUsages(usages: UsageLocation[]): FindUsagesSummary
{
	const allFiles = new Set<string>();
	const allModules = new Set<string>();
	const byType: Partial<Record<UsageType, number>> = {};

	const importsByName: Bucket = new Map();
	const namespacesByName: Bucket = new Map();
	const inheritanceByName: Bucket = new Map();
	const filesByModule: Bucket = new Map();
	const filesByType: Map<UsageType, Map<string, number>> = new Map();

	for (const usage of usages)
	{
		allFiles.add(usage.file);
		byType[usage.type] = (byType[usage.type] ?? 0) + 1;

		let perTypeFiles = filesByType.get(usage.type);
		if (!perTypeFiles)
		{
			perTypeFiles = new Map();
			filesByType.set(usage.type, perTypeFiles);
		}

		const existing = perTypeFiles.get(usage.file);
		if (existing === undefined || usage.line < existing)
		{
			perTypeFiles.set(usage.file, usage.line);
		}

		const module = moduleNameOf(usage.file);
		if (module)
		{
			allModules.add(module);
			addToBucket(filesByModule, module, usage.file, usage.line);
		}

		if (usage.type === 'js-import')
		{
			const names = usage.details?.imports;
			if (!names || names.length === 0)
			{
				addToBucket(importsByName, '(side-effect)', usage.file, usage.line);
			}
			else
			{
				for (const name of names)
				{
					addToBucket(importsByName, name, usage.file, usage.line);
				}
			}
		}
		else if (usage.type === 'js-namespace')
		{
			const ns = usage.details?.namespace;
			if (ns)
			{
				addToBucket(namespacesByName, ns, usage.file, usage.line);
			}
		}
		else if (usage.type === 'js-inheritance')
		{
			const from = usage.details?.inheritedFrom;
			if (from)
			{
				addToBucket(inheritanceByName, from, usage.file, usage.line);
			}
		}
	}

	const locationsByType: Partial<Record<UsageType, CountedLocation[]>> = {};
	for (const [type, perFile] of filesByType)
	{
		locationsByType[type] = [...perFile.entries()]
			.map(([file, line]) => ({ file, line }))
			.sort((a, b) => a.file.localeCompare(b.file));
	}

	return {
		totalUsages: usages.length,
		totalFiles: allFiles.size,
		totalModules: allModules.size,
		byType,
		locationsByType,
		imports: bucketToCounted(importsByName),
		namespaces: bucketToCounted(namespacesByName),
		inheritance: bucketToCounted(inheritanceByName),
		topModules: bucketToCounted(filesByModule),
	};
}

function addToBucket(bucket: Bucket, key: string, file: string, line: number): void
{
	let perFile = bucket.get(key);
	if (!perFile)
	{
		perFile = new Map();
		bucket.set(key, perFile);
	}

	const existing = perFile.get(file);
	if (existing === undefined || line < existing)
	{
		perFile.set(file, line);
	}
}

function bucketToCounted(bucket: Bucket): CountedItem[]
{
	return [...bucket.entries()]
		.map(([name, perFile]) => ({
			name,
			files: perFile.size,
			locations: [...perFile.entries()]
				.map(([file, line]) => ({ file, line }))
				.sort((a, b) => a.file.localeCompare(b.file)),
		}))
		.sort((a, b) => b.files - a.files || a.name.localeCompare(b.name));
}

/**
 * Extract Bitrix module name from an absolute file path. Bitrix lays out modules
 * as `.../<module>/install/...` — we take the segment immediately before `/install/`.
 * Returns null for files that don't fit the layout (e.g. test fixtures).
 */
function moduleNameOf(file: string): string | null
{
	const normalized = file.replaceAll('\\', '/');
	const idx = normalized.indexOf('/install/');
	if (idx === -1)
	{
		return null;
	}

	const before = normalized.slice(0, idx);
	const lastSlash = before.lastIndexOf('/');

	return lastSlash === -1 ? before : before.slice(lastSlash + 1);
}
