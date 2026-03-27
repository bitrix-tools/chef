import chalk from 'chalk';
import { Command } from 'commander';

import { createPathOption } from '../../shared/options/path-option';
import { createLimitOption } from './options/limit-option';
import { collectPackages } from './package-collector';
import { createSpinner } from './progress-spinner';
import { formatRanking } from './formatters/ranking-formatter';
import { formatSize } from '../../utils/format-size';
import { analyzePopular } from './analyzers/popular-analyzer';
import { analyzeHeavyDeps } from './analyzers/heavy-deps-analyzer';
import { analyzeDeepDeps } from './analyzers/deep-deps-analyzer';
import { analyzeHeavyBundles } from './analyzers/heavy-bundles-analyzer';
import { analyzeHeavyTotal } from './analyzers/heavy-total-analyzer';
import { analyzeConfig, analyzeConfigExcept, analyzeConfigMissing } from './analyzers/config-analyzer';
import { analyzeUnusedDeps } from './analyzers/unused-deps-analyzer';
import { PackageResolver } from '../../modules/packages/package-resolver';
import { findCircularDependencies } from '../../utils/package/find-circular-dependencies';
import { findUsages, groupByType, getTypeLabel, relativePath } from './analyzers/find-usages-analyzer';
import { analyzeOrphans } from './analyzers/orphan-analyzer';
import { findCircularImports } from './analyzers/circular-imports-analyzer';
import { ExtensionPackage } from '../../modules/packages/package/extension-package';
import { createIncludeOption, createExcludeOption, createNameFilter } from './options/name-filter-option';

import { findExportedGlobals } from './package-snapshot';

import type { UsageLocation } from './analyzers/find-usages-analyzer';
import type { SnapshotField } from './package-snapshot';
import type { BasePackage } from '../../modules/packages/base-package';

const diagCommand = new Command('diag');

diagCommand.description('Diagnose and analyze extensions across the project');

function filterByName<T extends { name: string }>(items: T[], args: { include?: string[]; exclude?: string[] }): T[]
{
	const nameFilter = createNameFilter(args);

	if (!nameFilter)
	{
		return items;
	}

	return items.filter((item) => nameFilter(item.name));
}

function dim(text: string): string
{
	return chalk.dim(text);
}

function hi(text: string): string
{
	return chalk.reset(text);
}

function printHowItWorks(lines: string[]): void
{
	console.log('');

	for (const line of lines)
	{
		console.log(` ${line}`);
	}
}

// region: top-used

const TOP_USED_HOW_IT_WORKS = [
	dim(`For each extension, counts how many other extensions declare it`),
	dim(`as a dependency in their ${hi('config.php rel')} array.`),
	'',
	dim(`High dependents count means the extension is ${hi('widely used')} —`),
	dim(`changes to it affect many other extensions.`),
];

const topUsedCommand = new Command('top-used')
	.description('Show most depended-on extensions')
	.addHelpText('after', '\nHow it works:\n  ' + TOP_USED_HOW_IT_WORKS.join('\n  ') + '\n')
	.addOption(createPathOption('Scan for extensions starting from this directory'))
	.addOption(createLimitOption())
	.addOption(createIncludeOption())
	.addOption(createExcludeOption())
	.action(async (args) => {
		const fields: Set<SnapshotField> = new Set(['dependencies']);
		const { snapshots, duration, scanned } = await collectPackages({
			startDirectory: args.path,
			fields,
			title: `TOP ${args.limit} most depended-on extensions`,
			howItWorks: TOP_USED_HOW_IT_WORKS,
		});
		const results = filterByName(analyzePopular(snapshots, Infinity), args).slice(0, args.limit);

		console.log(formatRanking({
			items: results,
			columns: [
				{ label: 'Extension', value: (item) => item.name },
				{ label: 'Dependents', value: (item) => String(item.dependents), align: 'right' },
			],
			scanned,
			duration,
		}));
	});

// endregion

// region: top-deps

const TOP_DEPS_HOW_IT_WORKS = [
	dim(`Counts direct dependencies from the ${hi('config.php rel')} array`),
	dim(`for each extension.`),
	'',
	dim(`Many direct dependencies increase page load — each dependency`),
	dim(`and its transitive tree will be loaded in the browser.`),
];

const topDepsCommand = new Command('top-deps')
	.description('Show extensions with the most direct dependencies')
	.addHelpText('after', '\nHow it works:\n  ' + TOP_DEPS_HOW_IT_WORKS.join('\n  ') + '\n')
	.addOption(createPathOption('Scan for extensions starting from this directory'))
	.addOption(createLimitOption())
	.addOption(createIncludeOption())
	.addOption(createExcludeOption())
	.action(async (args) => {
		const fields: Set<SnapshotField> = new Set(['dependencies']);
		const { snapshots, duration, scanned } = await collectPackages({
			startDirectory: args.path,
			fields,
			title: `TOP ${args.limit} extensions with most direct dependencies`,
			howItWorks: TOP_DEPS_HOW_IT_WORKS,
		});

		const results = filterByName(analyzeHeavyDeps(snapshots, Infinity), args).slice(0, args.limit);

		console.log(formatRanking({
			items: results,
			columns: [
				{ label: 'Extension', value: (item) => item.name },
				{ label: 'Dependencies', value: (item) => String(item.count), align: 'right' },
			],
			scanned,
			duration,
		}));
	});

// endregion

// region: top-deps-tree

const TOP_DEPS_TREE_HOW_IT_WORKS = [
	dim(`Recursively resolves the full dependency tree (${hi('config.php rel')})`),
	dim(`and counts the total number of unique ${hi('transitive')} dependencies.`),
	'',
	dim(`Tree size shows the true dependency footprint — two extensions`),
	dim(`with 5 direct deps each can have vastly different tree sizes.`),
];

const topDepsTreeCommand = new Command('top-deps-tree')
	.description('Show extensions with the largest dependency tree')
	.addHelpText('after', '\nHow it works:\n  ' + TOP_DEPS_TREE_HOW_IT_WORKS.join('\n  ') + '\n')
	.addOption(createPathOption('Scan for extensions starting from this directory'))
	.addOption(createLimitOption())
	.addOption(createIncludeOption())
	.addOption(createExcludeOption())
	.action(async (args) => {
		const fields: Set<SnapshotField> = new Set(['dependencyTreeSize']);
		const { snapshots, duration, scanned } = await collectPackages({
			startDirectory: args.path,
			fields,
			title: `TOP ${args.limit} extensions with largest dependency tree`,
			howItWorks: TOP_DEPS_TREE_HOW_IT_WORKS,
		});

		const results = filterByName(analyzeDeepDeps(snapshots, Infinity), args).slice(0, args.limit);

		console.log(formatRanking({
			items: results,
			columns: [
				{ label: 'Extension', value: (item) => item.name },
				{ label: 'Tree size', value: (item) => String(item.treeSize), align: 'right' },
			],
			scanned,
			duration,
		}));
	});

// endregion

// region: top-bundle-size

const TOP_BUNDLE_SIZE_HOW_IT_WORKS = [
	dim(`Measures the file size of compiled ${hi('JS')} and ${hi('CSS')} bundles`),
	dim(`for each extension. Dependencies are ${hi('not')} included.`),
	'',
	dim(`This is the extension's own code that the browser will download.`),
	dim(`To see the full picture with dependencies, use ${hi('top-total-size')}.`),
];

const topBundleSizeCommand = new Command('top-bundle-size')
	.description('Show extensions with the largest bundle size')
	.addHelpText('after', '\nHow it works:\n  ' + TOP_BUNDLE_SIZE_HOW_IT_WORKS.join('\n  ') + '\n')
	.addOption(createPathOption('Scan for extensions starting from this directory'))
	.addOption(createLimitOption())
	.addOption(createIncludeOption())
	.addOption(createExcludeOption())
	.action(async (args) => {
		const fields: Set<SnapshotField> = new Set(['bundleSize']);
		const { snapshots, duration, scanned } = await collectPackages({
			startDirectory: args.path,
			fields,
			title: `TOP ${args.limit} extensions with largest bundle size`,
			howItWorks: TOP_BUNDLE_SIZE_HOW_IT_WORKS,
		});

		const results = filterByName(analyzeHeavyBundles(snapshots, Infinity), args).slice(0, args.limit);

		console.log(formatRanking({
			items: results,
			columns: [
				{ label: 'Extension', value: (item) => item.name },
				{ label: 'JS', value: (item) => formatSize({ size: item.js }), align: 'right' },
				{ label: 'CSS', value: (item) => formatSize({ size: item.css }), align: 'right' },
				{ label: 'Total', value: (item) => chalk.bold(formatSize({ size: item.total })), align: 'right' },
			],
			scanned,
			duration,
		}));
	});

// endregion

// region: top-total-size

const TOP_TOTAL_SIZE_HOW_IT_WORKS = [
	dim(`Total size = own bundle + all transitive dependency bundles.`),
	dim(`This is ${hi('everything the browser downloads')} when the extension is loaded.`),
	'',
	dim(`${hi('Own')}   — extension bundle size (JS + CSS)`),
	dim(`${hi('Total')} — own + all transitive dependency bundles`),
	dim(`${hi('Deps')}  — direct dependencies (config.php rel)`),
	dim(`${hi('Tree')}  — total unique transitive dependencies`),
];

const topTotalSizeCommand = new Command('top-total-size')
	.description('Show extensions with the largest total size (own code + dependencies)')
	.addHelpText('after', '\nHow it works:\n  ' + TOP_TOTAL_SIZE_HOW_IT_WORKS.join('\n  ') + '\n')
	.addOption(createPathOption('Scan for extensions starting from this directory'))
	.addOption(createLimitOption())
	.addOption(createIncludeOption())
	.addOption(createExcludeOption())
	.action(async (args) => {
		const fields: Set<SnapshotField> = new Set(['bundleSize', 'totalSize', 'dependencies', 'dependencyTreeSize']);
		const { snapshots, duration, scanned } = await collectPackages({
			startDirectory: args.path,
			fields,
			title: `TOP ${args.limit} extensions with largest total transferred size`,
			howItWorks: TOP_TOTAL_SIZE_HOW_IT_WORKS,
		});

		const results = filterByName(analyzeHeavyTotal(snapshots, Infinity), args).slice(0, args.limit);

		console.log(formatRanking({
			items: results,
			columns: [
				{ label: 'Extension', value: (item) => item.name },
				{ label: 'Own', value: (item) => formatSize({ size: item.ownTotal }), align: 'right' },
				{ label: 'Total', value: (item) => chalk.bold(formatSize({ size: item.total })), align: 'right' },
				{ label: 'Deps', value: (item) => String(item.directDeps), align: 'right' },
				{ label: 'Tree', value: (item) => String(item.treeDeps), align: 'right' },
			],
			scanned,
			duration,
		}));
	});

// endregion

// region: config

const CONFIG_HOW_IT_WORKS = [
	dim(`Reads ${hi('bundle.config.js/ts')} for each extension.`),
	'',
	dim(`${hi('--key')}      find extensions that have the specified parameter`),
	dim(`${hi('--value')}    filter by value (substring for strings, contains for arrays)`),
	dim(`${hi('--except')}   find extensions with parameters OTHER than specified`),
	dim(`${hi('--missing')}  find extensions where the specified parameters are absent`),
];

const configCommand = new Command('config')
	.description('Search extensions by bundle config parameter')
	.addHelpText('after', '\nHow it works:\n  ' + CONFIG_HOW_IT_WORKS.join('\n  ')
		+ '\n\nExamples:\n  $ chef diag config --key namespace\n  $ chef diag config --key concat --key adjustConfigPhp\n  $ chef diag config --key targets --value "chrome 100"\n  $ chef diag config --key input --key output --except\n  $ chef diag config --key minification --missing\n')
	.addOption(createPathOption('Scan for extensions starting from this directory'))
	.addOption(createIncludeOption())
	.addOption(createExcludeOption())
	.requiredOption('-k, --key <key...>', 'Config parameter name(s) to search (repeatable)')
	.option('-v, --value <value>', 'Filter by parameter value (substring match)')
	.option('-e, --except', 'Invert: find extensions with keys OTHER than the specified ones')
	.option('-m, --missing', 'Find extensions where the specified keys are absent')
	.action(async (args) => {
		const keys: string[] = args.key;
		const fields: Set<SnapshotField> = new Set(['bundleConfig']);

		const keyLabel = keys.map((k: string) => `"${k}"`).join(', ');
		const title = args.missing
			? `Extensions missing ${keyLabel} in config`
			: args.except
				? `Extensions with config keys other than ${keyLabel}`
				: args.value
					? `Extensions with ${keys.map((k: string) => `"${k}"`).join(' or ')} = "${args.value}"`
					: `Extensions with ${keys.map((k: string) => `"${k}"`).join(' or ')} in config`;

		const { snapshots, duration, scanned } = await collectPackages({
			startDirectory: args.path,
			fields,
			title,
			howItWorks: CONFIG_HOW_IT_WORKS,
		});

		if (args.missing)
		{
			const results = filterByName(analyzeConfigMissing(snapshots, keys), args);

			console.log(formatRanking({
				items: results,
				columns: [
					{ label: 'Extension', value: (item) => item.name },
					{ label: 'Missing keys', value: (item) => item.missingKeys.join(', ') },
				],
				scanned,
				duration,
			}));

			return;
		}

		if (args.except)
		{
			const results = filterByName(analyzeConfigExcept(snapshots, new Set(keys)), args);

			console.log(formatRanking({
				items: results,
				columns: [
					{ label: 'Extension', value: (item) => item.name },
					{ label: 'Key', value: (item) => formatConfigEntryKeys(item.entries) },
					{ label: 'Value', value: (item) => formatConfigEntryValues(item.entries) },
				],
				scanned,
				duration,
			}));

			return;
		}

		const results = filterByName(analyzeConfig(snapshots, keys, args.value), args);

		console.log(formatRanking({
			items: results,
			columns: [
				{ label: 'Extension', value: (item) => item.name },
				{ label: 'Key', value: (item) => item.key },
				{ label: 'Value', value: (item) => formatConfigValue(item.value) },
			],
			scanned,
			duration,
		}));
	});

function formatConfigValue(value: unknown): string
{
	if (value === null || value === undefined)
	{
		return String(value);
	}

	if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number')
	{
		return String(value);
	}

	return JSON.stringify(value, null, 2);
}

function formatConfigEntryKeys(entries: { key: string; value: unknown }[]): string
{
	const keyLines: string[] = [];

	for (const entry of entries)
	{
		const valueLineCount = formatConfigValue(entry.value).split('\n').length;
		keyLines.push(entry.key);

		for (let i = 1; i < valueLineCount; i++)
		{
			keyLines.push('');
		}
	}

	return keyLines.join('\n');
}

function formatConfigEntryValues(entries: { key: string; value: unknown }[]): string
{
	return entries.map((e) => formatConfigValue(e.value)).join('\n');
}

// endregion

function wrapList(items: string[], maxWidth: number): string
{
	const lines: string[] = [];
	let currentLine = '';

	for (const item of items)
	{
		const separator = currentLine.length > 0 ? ', ' : '';
		if (currentLine.length > 0 && currentLine.length + separator.length + item.length > maxWidth)
		{
			lines.push(currentLine);
			currentLine = item;
		}
		else
		{
			currentLine += separator + item;
		}
	}

	if (currentLine.length > 0)
	{
		lines.push(currentLine);
	}

	return lines.join('\n');
}

// region: unused-deps

const UNUSED_DEPS_HOW_IT_WORKS = [
	dim(`Compares ${hi('config.php rel')} against actual usage in source files.`),
	dim(`Comments are ignored. A dependency is considered used if found via:`),
	'',
	dim(`  ${hi("import { Foo } from 'extension.name'")}`),
	dim(`  ${hi("import 'extension.name'")}                  (side-effect import)`),
	dim(`  ${hi("Reflection.getClass('BX.Namespace.Class')")}`),
	dim(`  ${hi('BX.Namespace.Class')}                       (matched against exported globals)`),
	'',
	dim(`Exported globals = namespace + exported names from the entry point.`),
	dim(`${hi('BX.loadExtension')} / ${hi('Runtime.loadExtension')} are ${hi('NOT')} counted (dynamic loading).`),
];

const unusedDepsCommand = new Command('unused-deps')
	.description('Find extensions with unused dependencies')
	.addHelpText('after', '\nHow it works:\n  ' + UNUSED_DEPS_HOW_IT_WORKS.join('\n  ') + '\n')
	.addOption(createPathOption('Scan for extensions starting from this directory'))
	.addOption(createLimitOption())
	.addOption(createIncludeOption())
	.addOption(createExcludeOption())
	.action(async (args) => {
		const fields: Set<SnapshotField> = new Set(['dependencies', 'importedExtensions']);
		const { snapshots, duration, scanned } = await collectPackages({
			startDirectory: args.path,
			fields,
			title: `TOP ${args.limit} extensions with unused dependencies`,
			howItWorks: UNUSED_DEPS_HOW_IT_WORKS,
		});

		const results = filterByName(analyzeUnusedDeps(snapshots, Infinity), args).slice(0, args.limit);

		console.log(formatRanking({
			items: results,
			columns: [
				{ label: 'Extension', value: (item) => item.name },
				{ label: 'Count', value: (item) => String(item.unused.length), align: 'right' },
				{ label: 'Unused dependencies', value: (item) => wrapList(item.unused, 60) },
			],
			scanned,
			duration,
		}));
	});

// endregion

// region: circular-deps

const CIRCULAR_DEPS_HOW_IT_WORKS = [
	dim(`Walks the ${hi('config.php')} dependency tree of each extension`),
	dim(`and detects cycles back to the root.`),
	'',
	dim(`Without arguments: scans all extensions and reports those with cycles.`),
	dim(`With arguments: checks only the specified extensions.`),
	'',
	dim(`${hi('A → A')}       self-dependency — the extension lists itself in rel`),
	dim(`${hi('A → B → A')}   mutual dependency — causes load order issues,`),
	dim(`            one extension may initialize before the other is ready`),
	dim(`${hi('A → … → A')}   longer chains are less critical`),
	dim(`            but indicate tightly coupled code`),
];

const circularDepsCommand = new Command('circular-deps')
	.description('Check extensions for circular dependencies')
	.addHelpText('after', '\nHow it works:\n  ' + CIRCULAR_DEPS_HOW_IT_WORKS.join('\n  ')
		+ '\n\nExamples:\n  $ chef diag circular-deps\n  $ chef diag circular-deps main.core\n  $ chef diag circular-deps main.core ui.buttons crm.timeline\n')
	.argument('[extensions...]', 'Extensions to check (all if omitted)')
	.addOption(createPathOption('Scan for extensions starting from this directory'))
	.addOption(createIncludeOption())
	.addOption(createExcludeOption())
	.action(async (extensions: string[], args) => {
		if (extensions.length === 0)
		{
			await checkAllCircularDeps(args);
		}
		else
		{
			await checkSpecificCircularDeps(extensions, args);
		}
	});

async function checkAllCircularDeps(args: { path: string; include?: string[]; exclude?: string[] }): Promise<void>
{
	const hasInclude = args.include && args.include.length > 0;
	const excludeFilter = args.exclude?.length ? createNameFilter({ exclude: args.exclude }) : undefined;
	const fields: Set<SnapshotField> = new Set();
	const { snapshots, duration: collectDuration, scanned } = await collectPackages({
		startDirectory: args.path,
		fields,
		title: 'Circular dependency scan',
		howItWorks: CIRCULAR_DEPS_HOW_IT_WORKS,
		includePatterns: hasInclude ? args.include : undefined,
		filter: (extension) => {
			if (!(extension instanceof ExtensionPackage))
			{
				return false;
			}

			if (excludeFilter && !excludeFilter(extension.getName()))
			{
				return false;
			}

			return true;
		},
	});

	const start = performance.now();
	const spinner = createSpinner(`Checking circular dependencies... 0/${snapshots.length}`);
	let checked = 0;

	type CircularResult = { name: string; cycles: string[][] };
	const results: CircularResult[] = [];

	for (const snapshot of snapshots)
	{
		checked++;
		spinner.update(`Checking circular dependencies... ${checked}/${snapshots.length}`);

		const extension = PackageResolver.resolve(snapshot.name);
		if (!extension)
		{
			continue;
		}

		const cycles = await findCircularDependencies({ target: extension });
		if (cycles.length > 0)
		{
			results.push({ name: snapshot.name, cycles });
		}
	}

	spinner.stop();

	if (results.length === 0)
	{
		console.log('  No circular dependencies found');
	}
	else
	{
		results.sort((a, b) => a.name.localeCompare(b.name));

		for (const result of results)
		{
			console.log(` ${chalk.red('✗')} ${result.name} ${chalk.red(`${result.cycles.length} circular ${result.cycles.length === 1 ? 'dependency' : 'dependencies'}`)}`);

			for (const cycle of result.cycles)
			{
				console.log(`   ${chalk.dim('→')} ${cycle.join(' → ')}`);
			}

			console.log('');
		}
	}

	const totalDuration = collectDuration + (performance.now() - start);
	const durationStr = (totalDuration / 1000).toFixed(2);
	console.log(` ${chalk.dim(`Checked ${snapshots.length} extensions, found ${results.length} with circular dependencies in ${durationStr}s`)}`);
	console.log('');

	if (results.length > 0)
	{
		process.exitCode = 1;
	}
}

async function checkSpecificCircularDeps(extensions: string[], args: { path: string }): Promise<void>
{
	const start = performance.now();
	let hasCircular = false;

	console.log('');
	console.log(` ${chalk.bold('Circular dependency check')}`);
	printHowItWorks(CIRCULAR_DEPS_HOW_IT_WORKS);
	console.log('');

	for (const name of extensions)
	{
		const extension: BasePackage | null = PackageResolver.resolve(name);
		if (!extension)
		{
			console.log(` ${chalk.red('✗')} ${name} ${chalk.dim('not found')}`);
			continue;
		}

		const cycles = await findCircularDependencies({ target: extension });

		if (cycles.length === 0)
		{
			console.log(` ${chalk.green('✓')} ${name} ${chalk.dim('no circular dependencies')}`);
		}
		else
		{
			hasCircular = true;
			console.log(` ${chalk.red('✗')} ${name} ${chalk.red(`${cycles.length} circular ${cycles.length === 1 ? 'dependency' : 'dependencies'}`)}`);

			for (const cycle of cycles)
			{
				console.log(`   ${chalk.dim('→')} ${cycle.join(' → ')}`);
			}
		}
	}

	const duration = ((performance.now() - start) / 1000).toFixed(2);
	console.log('');
	console.log(` ${chalk.dim(`Checked ${extensions.length} ${extensions.length === 1 ? 'extension' : 'extensions'} in ${duration}s`)}`);
	console.log('');

	if (hasCircular)
	{
		process.exitCode = 1;
	}
}

// endregion

// region: circular-imports

const CIRCULAR_IMPORTS_HOW_IT_WORKS = [
	dim(`Parses ${hi('import/export')} statements with relative paths (${hi('./')}  ${hi('../')})`),
	dim(`in each extension's source files and detects cycles in the import graph.`),
	'',
	dim(`Without arguments: scans all extensions and reports those with cycles.`),
	dim(`With arguments: checks only the specified extensions.`),
	'',
	dim(`${hi('A → B → A')}   most critical — one of the modules will receive`),
	dim(`            an ${hi('uninitialized export')} at runtime, causing errors`),
	dim(`${hi('A → … → A')}   longer chains are less likely to cause issues —`),
	dim(`            the circular module is often already initialized`),
	dim(`            by the time it is accessed`),
];

const circularImportsCommand = new Command('circular-imports')
	.description('Check extensions for circular imports between source files')
	.addHelpText('after', '\nHow it works:\n  ' + CIRCULAR_IMPORTS_HOW_IT_WORKS.join('\n  ')
		+ '\n\nExamples:\n  $ chef diag circular-imports\n  $ chef diag circular-imports main.core\n')
	.argument('[extensions...]', 'Extensions to check (all if omitted)')
	.addOption(createPathOption('Scan for extensions starting from this directory'))
	.addOption(createIncludeOption())
	.addOption(createExcludeOption())
	.action(async (extensions: string[], args) => {
		if (extensions.length === 0)
		{
			await checkAllCircularImports(args);
		}
		else
		{
			await checkSpecificCircularImports(extensions);
		}
	});

async function checkAllCircularImports(args: { path: string; include?: string[]; exclude?: string[] }): Promise<void>
{
	const hasInclude = args.include && args.include.length > 0;
	const excludeFilter = args.exclude?.length ? createNameFilter({ exclude: args.exclude }) : undefined;
	const fields: Set<SnapshotField> = new Set();
	const { snapshots, duration: collectDuration, scanned } = await collectPackages({
		startDirectory: args.path,
		fields,
		title: 'Circular import scan',
		howItWorks: CIRCULAR_IMPORTS_HOW_IT_WORKS,
		includePatterns: hasInclude ? args.include : undefined,
		filter: (extension) => {
			if (!(extension instanceof ExtensionPackage))
			{
				return false;
			}

			if (excludeFilter && !excludeFilter(extension.getName()))
			{
				return false;
			}

			return true;
		},
	});

	const start = performance.now();
	const spinner = createSpinner(`Checking circular imports... 0/${snapshots.length}`);
	let checked = 0;
	let totalCycles = 0;

	type Result = { name: string; cycles: string[][] };
	const results: Result[] = [];

	for (const snapshot of snapshots)
	{
		checked++;
		spinner.update(`Checking circular imports... ${checked}/${snapshots.length}`);

		const extension = PackageResolver.resolve(snapshot.name);
		if (!extension)
		{
			continue;
		}

		const sourceFiles = extension.getSourceFiles();
		if (sourceFiles.length === 0)
		{
			continue;
		}

		const cycles = await findCircularImports(sourceFiles, extension.getPath());
		if (cycles.length > 0)
		{
			totalCycles += cycles.length;
			results.push({ name: snapshot.name, cycles });
		}
	}

	spinner.stop();

	if (results.length === 0)
	{
		console.log('  No circular imports found');
	}
	else
	{
		results.sort((a, b) => a.name.localeCompare(b.name));

		for (const result of results)
		{
			console.log(` ${chalk.red('✗')} ${result.name} ${chalk.red(`${result.cycles.length} circular ${result.cycles.length === 1 ? 'import' : 'imports'}`)}`);

			for (const cycle of result.cycles)
			{
				console.log(`   ${chalk.dim('→')} ${cycle.join(' → ')}`);
			}

			console.log('');
		}
	}

	const totalDuration = collectDuration + (performance.now() - start);
	const durationStr = (totalDuration / 1000).toFixed(2);
	console.log(` ${chalk.dim(`Checked ${snapshots.length} extensions, found ${totalCycles} circular ${totalCycles === 1 ? 'import' : 'imports'} in ${results.length} ${results.length === 1 ? 'extension' : 'extensions'} in ${durationStr}s`)}`);
	console.log('');
}

async function checkSpecificCircularImports(extensions: string[]): Promise<void>
{
	const start = performance.now();
	let hasCircular = false;

	console.log('');
	console.log(` ${chalk.bold('Circular import check')}`);
	printHowItWorks(CIRCULAR_IMPORTS_HOW_IT_WORKS);
	console.log('');

	for (const name of extensions)
	{
		const extension: BasePackage | null = PackageResolver.resolve(name);
		if (!extension)
		{
			console.log(` ${chalk.red('✗')} ${name} ${chalk.dim('not found')}`);
			continue;
		}

		const sourceFiles = extension.getSourceFiles();
		if (sourceFiles.length === 0)
		{
			console.log(` ${chalk.green('✓')} ${name} ${chalk.dim('no source files')}`);
			continue;
		}

		const cycles = await findCircularImports(sourceFiles, extension.getPath());

		if (cycles.length === 0)
		{
			console.log(` ${chalk.green('✓')} ${name} ${chalk.dim('no circular imports')}`);
		}
		else
		{
			hasCircular = true;
			console.log(` ${chalk.red('✗')} ${name} ${chalk.red(`${cycles.length} circular ${cycles.length === 1 ? 'import' : 'imports'}`)}`);

			for (const cycle of cycles)
			{
				console.log(`   ${chalk.dim('→')} ${cycle.join(' → ')}`);
			}
		}
	}

	const duration = ((performance.now() - start) / 1000).toFixed(2);
	console.log('');
	console.log(` ${chalk.dim(`Checked ${extensions.length} ${extensions.length === 1 ? 'extension' : 'extensions'} in ${duration}s`)}`);
	console.log('');

	if (hasCircular)
	{
		process.exitCode = 1;
	}
}

// endregion

// region: find-usages

const FIND_USAGES_HOW_IT_WORKS = [
	dim(`Searches ${hi('JS')}, ${hi('TS')} and ${hi('PHP')} files. Comments are ignored.`),
	dim(`Skips node_modules, vendor, lang, db, images, test, meta, updates, routes.`),
	'',
	dim(`${hi('JS/TS')}  import 'ext', import { } from 'ext', BX.loadExtension('ext'),`),
	dim(`       BX.loadExt('ext'), Runtime.loadExtension('ext'),`),
	dim(`       BX.Namespace.Something (via bundle.config namespace)`),
	dim(`${hi('PHP')}    Extension::load('ext'), CJSCore::Init(['ext']), config.php rel,`),
	dim(`       BX.Namespace.Something in inline <script> tags`),
];

const findUsagesCommand = new Command('find-usages')
	.description('Find where an extension is used across JS, TS and PHP files')
	.addHelpText('after', '\nHow it works:\n  ' + FIND_USAGES_HOW_IT_WORKS.join('\n  ')
		+ '\n\nExamples:\n  $ chef diag find-usages main.core\n  $ chef diag find-usages ui.buttons\n')
	.argument('<extension>', 'Extension name to search for (e.g. ui.buttons)')
	.addOption(createPathOption('Search for usages starting from this directory'))
	.action(async (extensionName: string, args) => {
		const start = performance.now();

		console.log('');
		console.log(` ${chalk.bold(`Usages of ${extensionName}`)}`);
		printHowItWorks(FIND_USAGES_HOW_IT_WORKS);
		console.log('');

		const extension: BasePackage | null = PackageResolver.resolve(extensionName);
		const globals = extension ? await findExportedGlobals(extension) : new Set<string>();
		const usages = await findUsages(extensionName, extension, globals, args.path);
		const groups = groupByType(usages);
		const duration = ((performance.now() - start) / 1000).toFixed(2);

		if (usages.length === 0)
		{
			console.log(chalk.dim('  No usages found'));
		}
		else
		{
			for (const [type, locations] of groups)
			{
				console.log(` ${chalk.bold(getTypeLabel(type))} ${chalk.dim(`(${locations.length})`)}`);

				const areaGroups = groupByArea(locations, args.path);

				for (const [area, locs] of areaGroups)
				{
					console.log(`  ${chalk.cyan(area)}`);

					for (const loc of locs)
					{
						console.log(`    at ${loc.file}:${loc.line}`);
					}
				}

				console.log('');
			}
		}

		console.log(` ${chalk.dim(`Found ${usages.length} ${usages.length === 1 ? 'usage' : 'usages'} in ${duration}s`)}`);
		console.log('');
	});

function groupByArea(
	locations: UsageLocation[],
	startDirectory: string,
): Map<string, UsageLocation[]>
{
	const groups = new Map<string, UsageLocation[]>();

	for (const loc of locations)
	{
		const relPath = relativePath(loc.file, startDirectory);
		const area = classifyPath(relPath);
		const list = groups.get(area) ?? [];
		list.push(loc);
		groups.set(area, list);
	}

	return groups;
}

function classifyPath(relPath: string): string
{
	const parts = relPath.split('/');
	const moduleName = parts[0];

	// module/install/js/** → extension area
	const installJsIndex = relPath.indexOf('/install/js/');
	if (installJsIndex !== -1)
	{
		const afterInstallJs = relPath.slice(installJsIndex + '/install/js/'.length);
		const extParts = afterInstallJs.split('/');
		if (extParts.length >= 2)
		{
			return `${extParts[0]}.${extParts[1]}`;
		}

		return `${moduleName} (extensions)`;
	}

	// module/install/components/** → component area
	if (relPath.includes('/install/components/'))
	{
		const afterComponents = relPath.split('/install/components/')[1];
		const compParts = afterComponents.split('/');
		if (compParts.length >= 2)
		{
			return `${compParts[0]}:${compParts[1]} (component)`;
		}

		return `${moduleName} (components)`;
	}

	// module/install/mobileapp/** → mobile extension
	if (relPath.includes('/install/mobileapp/'))
	{
		return `${moduleName} (mobile)`;
	}

	return moduleName;
}

// endregion

// region: unused

const UNUSED_HOW_IT_WORKS = [
	dim(`Only JS extensions (no components, activities or templates).`),
	dim(`Comments are ignored.`),
	dim(`Skips node_modules, vendor, lang, db, images, test, meta, updates, routes.`),
	'',
	dim(`An extension is considered ${hi('used')} if:`),
	dim(`  ${hi('1.')} Listed as a dependency in another extension's ${hi('config.php rel')} array`),
	dim(`  ${hi('2.')} Its name appears in quotes in any ${hi('JS/TS')} file`),
	dim(`     (import 'ext', from 'ext', BX.loadExtension, BX.loadExt, Runtime.loadExtension)`),
	dim(`  ${hi('3.')} Its name appears in quotes in any ${hi('PHP')} file`),
	dim(`     (Extension::load, CJSCore::Init, config.php rel, inline JS)`),
];

const unusedCommand = new Command('unused')
	.description('Find extensions that are never referenced anywhere')
	.addHelpText('after', '\nHow it works:\n  ' + UNUSED_HOW_IT_WORKS.join('\n  ') + '\n')
	.addOption(createPathOption('Scan for extensions starting from this directory'))
	.addOption(createIncludeOption())
	.addOption(createExcludeOption())
	.action(async (args) => {
		const fields: Set<SnapshotField> = new Set(['dependencies']);
		const { snapshots, duration: collectDuration, scanned } = await collectPackages({
			startDirectory: args.path,
			fields,
			title: 'Unused extensions',
			howItWorks: UNUSED_HOW_IT_WORKS,
			filter: (extension) => extension instanceof ExtensionPackage,
		});

		const start = performance.now();
		const results = filterByName(await analyzeOrphans(snapshots, args.path), args);
		const searchDuration = performance.now() - start;
		const totalDuration = collectDuration + searchDuration;

		if (results.length === 0)
		{
			console.log('  No unused extensions found');
		}
		else
		{
			for (let i = 0; i < results.length; i++)
			{
				console.log(`  ${chalk.dim(String(i + 1).padStart(String(results.length).length))}  ${results[i].name}`);
			}
		}

		const durationStr = (totalDuration / 1000).toFixed(2);
		console.log('');
		console.log(` ${chalk.dim(`Found ${results.length} unused out of ${scanned} extensions in ${durationStr}s`)}`);
		console.log('');
	});

// endregion

diagCommand
	.addCommand(topUsedCommand)
	.addCommand(topDepsCommand)
	.addCommand(topDepsTreeCommand)
	.addCommand(topBundleSizeCommand)
	.addCommand(topTotalSizeCommand)
	.addCommand(configCommand)
	.addCommand(unusedDepsCommand)
	.addCommand(circularImportsCommand)
	.addCommand(circularDepsCommand)
	.addCommand(findUsagesCommand)
	.addCommand(unusedCommand);

export { diagCommand };
