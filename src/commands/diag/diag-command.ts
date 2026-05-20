import path from 'node:path';
import chalk from 'chalk';
import table from 'text-table';
import { Command, Option } from 'commander';

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

import type { HeavyBundlesSortKey } from './analyzers/heavy-bundles-analyzer';
import type { HeavyTotalSortKey } from './analyzers/heavy-total-analyzer';
import { analyzeConfig, analyzeConfigExcept, analyzeConfigMissing } from './analyzers/config-analyzer';
import { analyzeUnusedDeps } from './analyzers/unused-deps-analyzer';
import { PackageResolver } from '../../modules/packages/package-resolver';
import { findCircularDependencies } from '../../utils/package/find-circular-dependencies';
import { findUsages, findLoaders, groupByType, getTypeLabel, relativePath } from './analyzers/find-usages-analyzer';
import { summarizeUsages, filterUsages } from './analyzers/find-usages-summary';
import { analyzeOrphans } from './analyzers/orphan-analyzer';
import { findCircularImports } from './analyzers/circular-imports-analyzer';
import { analyzeReExports } from './analyzers/re-exports-analyzer';
import { ExtensionPackage } from '../../modules/packages/package/extension-package';
import { createIncludeOption, createExcludeOption, createNameFilter } from './options/name-filter-option';
import { CF } from '../../diagnostics/diagnostic-codes';
import { formatError } from '../../diagnostics/format-error';
import { stripAnsi } from '../../diagnostics/code-frame';
import {
	cleanBaselineMessage,
	extractBrowsersStr,
	extractFeatureName,
	extractFeatureLabel,
	formatRiskLine,
	formatCodeLabel,
	formatBrowserLines,
	formatCaniuseLink,
	baselineSeverity,
	riskColors,
} from '../../diagnostics/baseline-format';

import { findExportedGlobals } from './package-snapshot';
import { formatTree } from './formatters/tree-formatter';
import { findDependencyPath } from './analyzers/deps-path-analyzer';
import { flattenTree } from '../../utils/flatten-tree';

import type { UsageLocation, UsageType } from './analyzers/find-usages-analyzer';
import type { FindUsagesSummary, CountedItem } from './analyzers/find-usages-summary';
import type { SnapshotField } from './package-snapshot';
import type { BasePackage } from '../../modules/packages/base-package';

import { diag as diagJson } from '../../reporters/json/diag';
import { emitJson } from '../../reporters/json/emit';
import { createReporterOption } from '../../shared/options/reporter-option';

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
		if (args.reporter === 'json')
		{
			const result = await diagJson.topUsed({ path: args.path, limit: args.limit });
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

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
		if (args.reporter === 'json')
		{
			const result = await diagJson.topDeps({ path: args.path, limit: args.limit });
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

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
				{ label: 'Dependencies', value: (item) => String(item.directDeps), align: 'right' },
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
		if (args.reporter === 'json')
		{
			const result = await diagJson.topDepsTree({ path: args.path, limit: args.limit });
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

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
	dim(`Measures the file size of compiled ${hi('JS')}, ${hi('CSS')} bundles`),
	dim(`and referenced ${hi('assets')} (images, fonts, SVG).`),
	dim(`Dependencies are ${hi('not')} included.`),
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
	.option('--sort <column>', 'Sort by column: js, css, assets, total', 'total')
	.action(async (args) => {
		const sortBy = args.sort as HeavyBundlesSortKey;

		if (args.reporter === 'json')
		{
			const result = await diagJson.topBundleSize({ path: args.path, limit: args.limit, sortBy });
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

		const fields: Set<SnapshotField> = new Set(['bundleSize', 'assetsSize']);
		const { snapshots, duration, scanned } = await collectPackages({
			startDirectory: args.path,
			fields,
			title: `TOP ${args.limit} extensions with largest bundle size`,
			howItWorks: TOP_BUNDLE_SIZE_HOW_IT_WORKS,
		});

		const results = filterByName(analyzeHeavyBundles(snapshots, Infinity, sortBy), args).slice(0, args.limit);

		console.log(formatRanking({
			items: results,
			columns: [
				{ label: 'Extension', value: (item) => item.name },
				{ label: 'JS', value: (item) => formatSize({ size: item.js }), align: 'right' },
				{ label: 'CSS', value: (item) => formatSize({ size: item.css }), align: 'right' },
				{ label: 'Assets', value: (item) => item.assets > 0 ? formatSize({ size: item.assets }) : chalk.dim('—'), align: 'right' },
				{ label: 'Total', value: (item) => chalk.bold(formatSize({ size: item.total })), align: 'right' },
			],
			scanned,
			duration,
		}));
	});

// endregion

// region: top-total-size

const TOP_TOTAL_SIZE_HOW_IT_WORKS = [
	dim(`Total size = own bundle + assets + all transitive dependency bundles.`),
	dim(`This is ${hi('everything the browser downloads')} when the extension is loaded.`),
	'',
	dim(`${hi('Own')}   — extension bundle size (JS + CSS + assets)`),
	dim(`${hi('Total')} — own + all transitive dependency bundles and assets`),
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
	.option('--sort <column>', 'Sort by column: own, total, deps, tree', 'total')
	.action(async (args) => {
		const sortBy = args.sort as HeavyTotalSortKey;

		if (args.reporter === 'json')
		{
			const result = await diagJson.topTotalSize({ path: args.path, limit: args.limit, sortBy });
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

		const fields: Set<SnapshotField> = new Set(['bundleSize', 'assetsSize', 'totalSize', 'dependencies', 'dependencyTreeSize']);
		const { snapshots, duration, scanned } = await collectPackages({
			startDirectory: args.path,
			fields,
			title: `TOP ${args.limit} extensions with largest total transferred size`,
			howItWorks: TOP_TOTAL_SIZE_HOW_IT_WORKS,
		});

		const results = filterByName(analyzeHeavyTotal(snapshots, Infinity, sortBy), args).slice(0, args.limit);

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

		if (args.reporter === 'json')
		{
			const result = await diagJson.config({
				path: args.path,
				keys,
				value: args.value,
				except: args.except,
				missing: args.missing,
			});
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

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
		if (args.reporter === 'json')
		{
			const result = await diagJson.unusedDeps({ path: args.path, limit: args.limit });
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

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
		if (args.reporter === 'json')
		{
			const result = await diagJson.circularDeps({
				extension: extensions.length > 0 ? extensions : undefined,
				path: extensions.length > 0 ? undefined : args.path,
			});
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

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
		if (args.reporter === 'json')
		{
			const result = await diagJson.circularImports({
				extension: extensions.length > 0 ? extensions : undefined,
				path: extensions.length > 0 ? undefined : args.path,
			});
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

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
	dim(`Searches ${hi('JS')} and ${hi('TS')} files, plus inline ${hi('<script>')} blocks inside PHP. Comments are ignored.`),
	dim(`Skips node_modules, vendor, lang, db, images, test, meta, updates, routes.`),
	'',
	dim(`Detects:`),
	dim(`  ESM imports:`),
	dim(`    ${hi('import { X } from \'ext\'')}     — named import`),
	dim(`    ${hi('import X from \'ext\'')}         — default import`),
	dim(`    ${hi('import * as X from \'ext\'')}    — namespace import`),
	dim(`    ${hi('import \'ext\'')}                — side-effect import (no bindings)`),
	dim(`    ${hi('import(\'ext\')')}               — dynamic import`),
	dim(`    ${hi('export { X } from \'ext\'')}     — re-export`),
	dim(`    ${hi('export * from \'ext\'')}         — wildcard re-export`),
	dim(`  Dynamic load: ${hi('Runtime.loadExtension')}, ${hi('BX.loadExtension')}, ${hi('BX.loadExt')}`),
	dim(`  Namespace access: ${hi('BX.UI.Something')} (the chain declared via bundle.config namespace)`),
	dim(`  Inheritance: ${hi('class X extends Y')}, where Y is either:`),
	dim(`    a binding imported from the extension (${hi('import { Balloon } from \'ui.notification\'')}, then ${hi('extends Balloon')}), or`),
	dim(`    a BX.Namespace chain owned by the extension (${hi('extends BX.UI.Notification.Balloon')}).`),
	'',
	dim(`For PHP loaders (Extension::load, CJSCore::Init, config.php rel) see ${hi('chef diag find-loaders')}.`),
];

const KIND_ALIASES: Record<string, UsageType[]> = {
	import: ['js-import'],
	'import-dynamic': ['js-import-dynamic'],
	load: ['js-load-extension'],
	namespace: ['js-namespace'],
	extends: ['js-inheritance'],
	inheritance: ['js-inheritance'],
};

const findUsagesCommand = new Command('find-usages')
	.description("Find where an extension's JS code is used (imports, loaders, namespace access, inheritance)")
	.addHelpText('after', '\nHow it works:\n  ' + FIND_USAGES_HOW_IT_WORKS.join('\n  ')
		+ '\n\nExamples:'
		+ '\n  $ chef diag find-usages ui.notification              # summary (default)'
		+ '\n  $ chef diag find-usages ui.notification --list       # full list of locations'
		+ '\n  $ chef diag find-usages ui.notification --imports UI # only files importing { UI }'
		+ '\n  $ chef diag find-usages ui.notification --namespace BX.UI.Notification.Center'
		+ '\n  $ chef diag find-usages ui.notification --kind extends'
		+ '\n  $ chef diag find-usages ui.notification --kind import,load\n')
	.argument('<extension>', 'Extension name to search for (e.g. ui.buttons)')
	.addOption(createPathOption('Search for usages starting from this directory'))
	.option('-l, --list', 'Print full list of locations instead of a summary')
	.option('--imports <name>', 'Show only files that import this binding (e.g. UI, default, *, "(side-effect)")')
	.option('--namespace <chain>', 'Show only files that access this namespace (or a child of it)')
	.addOption(new Option('--kind <kinds>', 'Comma-separated usage kinds: import, import-dynamic, load, namespace, extends'))
	.action(async (extensionName: string, args) => {
		const filter = parseFindUsagesFilter(args);

		if (args.reporter === 'json')
		{
			const result = await diagJson.findUsages({
				extension: extensionName,
				path: args.path,
				imports: filter.imports,
				namespace: filter.namespace,
				kinds: filter.kinds,
				list: Boolean(args.list),
			});
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

		const start = performance.now();

		console.log('');
		console.log(` ${chalk.bold(`Usages of ${extensionName}`)}`);
		printHowItWorks(FIND_USAGES_HOW_IT_WORKS);
		console.log('');

		const extension: BasePackage | null = PackageResolver.resolve(extensionName);
		const globals = extension ? await findExportedGlobals(extension) : new Set<string>();
		const allUsages = await findUsages(extensionName, extension, globals, args.path);
		const usages = filterUsages(allUsages, filter);
		const duration = ((performance.now() - start) / 1000).toFixed(2);

		const showList = Boolean(args.list) || filter.imports !== undefined || filter.namespace !== undefined || filter.kinds !== undefined;

		if (usages.length === 0)
		{
			console.log(chalk.dim('  No usages found'));
		}
		else if (showList)
		{
			printUsagesList(usages, args.path);
		}
		else
		{
			printUsagesSummary(summarizeUsages(usages));
		}

		console.log(` ${chalk.dim(`Found ${usages.length} ${usages.length === 1 ? 'usage' : 'usages'} in ${duration}s`)}`);
		console.log('');
	});

type FindUsagesFilter = {
	imports?: string;
	namespace?: string;
	kinds?: UsageType[];
};

function parseFindUsagesFilter(args: any): FindUsagesFilter
{
	const filter: FindUsagesFilter = {};

	if (typeof args.imports === 'string' && args.imports.length > 0)
	{
		filter.imports = args.imports;
	}

	if (typeof args.namespace === 'string' && args.namespace.length > 0)
	{
		filter.namespace = args.namespace;
	}

	if (typeof args.kind === 'string' && args.kind.length > 0)
	{
		const tokens = args.kind.split(',').map((t: string) => t.trim()).filter(Boolean);
		const resolved = new Set<UsageType>();
		for (const token of tokens)
		{
			const expanded = KIND_ALIASES[token];
			if (!expanded)
			{
				console.error(chalk.red(`Unknown --kind value: ${token}`));
				console.error(chalk.dim(`Allowed: ${Object.keys(KIND_ALIASES).sort().join(', ')}`));
				process.exit(1);
			}

			for (const t of expanded)
			{
				resolved.add(t);
			}
		}

		filter.kinds = [...resolved];
	}

	return filter;
}

function printUsagesList(usages: UsageLocation[], startDirectory: string): void
{
	const groups = groupByType(usages);

	for (const [type, locations] of groups)
	{
		console.log(` ${chalk.bold(getTypeLabel(type))} ${chalk.dim(`(${locations.length})`)}`);

		const areaGroups = groupByArea(locations, startDirectory);

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

function printUsagesSummary(summary: FindUsagesSummary): void
{
	const fileWord = summary.totalFiles === 1 ? 'file' : 'files';
	const moduleWord = summary.totalModules === 1 ? 'module' : 'modules';
	console.log(` ${chalk.bold(`${summary.totalFiles} ${fileWord}`)} across ${chalk.bold(summary.totalModules)} ${moduleWord}`);
	console.log('');

	const typeOrder: UsageType[] = [
		'js-import',
		'js-import-dynamic',
		'js-load-extension',
		'js-namespace',
		'js-inheritance',
		'php-extension-load',
		'php-cjscore',
		'config-rel',
	];

	console.log(` ${chalk.bold('How')}`);
	for (const type of typeOrder)
	{
		const count = summary.byType[type];
		if (!count)
		{
			continue;
		}

		console.log(`   ${getTypeLabel(type)} ${chalk.dim(`(${count})`)}`);

		if (type === 'js-import')
		{
			printCountedBreakdown(summary.imports);
		}
		else if (type === 'js-namespace')
		{
			printCountedBreakdown(summary.namespaces);
		}
		else if (type === 'js-inheritance')
		{
			printCountedBreakdown(summary.inheritance);
		}
		else
		{
			// Types without a sub-breakdown (load-extension, dynamic import):
			// print locations directly under the heading.
			const locs = summary.locationsByType[type] ?? [];
			for (const loc of locs)
			{
				console.log(`     at ${loc.file}:${loc.line}`);
			}
		}
	}

	console.log('');
}

function printCountedBreakdown(items: CountedItem[]): void
{
	for (const item of items)
	{
		console.log(`     ${chalk.cyan(item.name)} ${chalk.dim(`(${item.files})`)}`);

		for (const loc of item.locations)
		{
			console.log(`       at ${loc.file}:${loc.line}`);
		}
	}
}

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

function classifyPath(relPathRaw: string): string
{
	const relPath = relPathRaw.replaceAll('\\', '/');
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

// region: find-loaders

const FIND_LOADERS_HOW_IT_WORKS = [
	dim(`Searches ${hi('PHP')} files only. Reports extension loaders:`),
	dim(`  ${hi('Extension::load(\'ext\')')} — Bitrix Main UI Extension loader`),
	dim(`  ${hi('CJSCore::Init([\'ext\'])')} — legacy CJSCore loader`),
	dim(`  ${hi('config.php rel array')} — dependency declarations`),
];

const LOADER_TYPES = ['php-extension-load', 'php-cjscore', 'config-rel'] as const;

const findLoadersCommand = new Command('find-loaders')
	.description('Find where an extension is loaded from PHP (Extension::load, CJSCore::Init, config.php rel)')
	.addHelpText('after', '\nHow it works:\n  ' + FIND_LOADERS_HOW_IT_WORKS.join('\n  ')
		+ '\n\nExamples:'
		+ '\n  $ chef diag find-loaders ui.notification              # summary'
		+ '\n  $ chef diag find-loaders ui.notification --list       # full list'
		+ '\n  $ chef diag find-loaders ui.notification --kind config-rel\n')
	.argument('<extension>', 'Extension name (e.g. ui.notification)')
	.addOption(createPathOption('Search for loaders starting from this directory'))
	.option('-l, --list', 'Print full list of locations instead of a summary')
	.addOption(new Option('--kind <kinds>', 'Comma-separated loader kinds: php-extension-load, php-cjscore, config-rel'))
	.action(async (extensionName: string, args) => {
		const kinds = parseLoaderKinds(args.kind);

		if (args.reporter === 'json')
		{
			const result = await diagJson.findLoaders({ extension: extensionName, path: args.path });
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

		const start = performance.now();

		console.log('');
		console.log(` ${chalk.bold(`Loaders for ${extensionName}`)}`);
		printHowItWorks(FIND_LOADERS_HOW_IT_WORKS);
		console.log('');

		const allLoaders = await findLoaders(extensionName, args.path);
		const loaders = kinds ? allLoaders.filter((l) => kinds.includes(l.type)) : allLoaders;
		const duration = ((performance.now() - start) / 1000).toFixed(2);

		const showList = Boolean(args.list) || kinds !== undefined;

		if (loaders.length === 0)
		{
			console.log(chalk.dim('  No loaders found'));
		}
		else if (showList)
		{
			printUsagesList(loaders, args.path);
		}
		else
		{
			printLoadersSummary(loaders);
		}

		console.log(` ${chalk.dim(`Found ${loaders.length} ${loaders.length === 1 ? 'loader' : 'loaders'} in ${duration}s`)}`);
		console.log('');
	});

function parseLoaderKinds(raw: string | undefined): UsageType[] | undefined
{
	if (typeof raw !== 'string' || raw.length === 0)
	{
		return undefined;
	}

	const tokens = raw.split(',').map((t) => t.trim()).filter(Boolean);
	const allowed: ReadonlySet<UsageType> = new Set(LOADER_TYPES);
	const resolved: UsageType[] = [];

	for (const token of tokens)
	{
		if (!allowed.has(token as UsageType))
		{
			console.error(chalk.red(`Unknown --kind value: ${token}`));
			console.error(chalk.dim(`Allowed: ${LOADER_TYPES.join(', ')}`));
			process.exit(1);
		}

		resolved.push(token as UsageType);
	}

	return resolved;
}

function printLoadersSummary(loaders: UsageLocation[]): void
{
	const summary = summarizeUsages(loaders);
	const fileWord = summary.totalFiles === 1 ? 'file' : 'files';
	const moduleWord = summary.totalModules === 1 ? 'module' : 'modules';

	console.log(` ${chalk.bold(`${summary.totalFiles} ${fileWord}`)} across ${chalk.bold(summary.totalModules)} ${moduleWord}`);
	console.log('');

	console.log(` ${chalk.bold('How')}`);
	for (const type of LOADER_TYPES)
	{
		const count = summary.byType[type];
		if (!count)
		{
			continue;
		}

		console.log(`   ${getTypeLabel(type)} ${chalk.dim(`(${count})`)}`);

		const locs = summary.locationsByType[type] ?? [];
		for (const loc of locs)
		{
			console.log(`     at ${loc.file}:${loc.line}`);
		}
	}

	console.log('');
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
		if (args.reporter === 'json')
		{
			const result = await diagJson.unused({ path: args.path });
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

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

// region: deps-tree

const DEPS_TREE_HOW_IT_WORKS = [
	dim(`Reads the dependency tree from ${hi('config.php rel')} recursively.`),
	'',
	dim(`Duplicate subtrees are collapsed (shown as ${hi('(duplicate)')}).`),
	dim(`${hi('--flat')}      show a flat list of all transitive dependencies`),
	dim(`${hi('--depth N')}   limit tree depth`),
	dim(`${hi('--why ext')}   find the shortest path to a specific dependency`),
];

const depsTreeCommand = new Command('deps-tree')
	.description('Show the dependency tree for an extension')
	.addHelpText('after', '\nHow it works:\n  ' + DEPS_TREE_HOW_IT_WORKS.join('\n  ')
		+ '\n\nExamples:\n  $ chef diag deps-tree main.core\n  $ chef diag deps-tree ui.vue3 --flat\n  $ chef diag deps-tree crm.timeline --depth 2\n  $ chef diag deps-tree crm.timeline --why main.core\n')
	.argument('<extension>', 'Extension name (e.g. ui.vue3)')
	.option('-f, --flat', 'Show a flat list instead of a tree')
	.option('-d, --depth <n>', 'Limit tree depth', parseInt)
	.option('-w, --why <extension>', 'Find the path to a specific dependency')
	.action(async (extensionName: string, args) => {
		if (args.reporter === 'json')
		{
			const result = await diagJson.depsTree({
				extension: extensionName,
				flat: args.flat,
				depth: args.depth,
				why: args.why,
			});
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

		const start = performance.now();

		const extension: BasePackage | null = PackageResolver.resolve(extensionName);
		if (!extension)
		{
			console.log('');
			console.log(` ${chalk.red('✗')} Extension ${chalk.bold(extensionName)} not found`);
			console.log('');
			return;
		}

		console.log('');
		console.log(` ${chalk.bold(`Dependency tree for ${extensionName}`)}`);
		printHowItWorks(DEPS_TREE_HOW_IT_WORKS);
		console.log('');

		const tree = await extension.getDependenciesTree();
		const duration = ((performance.now() - start) / 1000).toFixed(2);
		const flatDeps = flattenTree(tree, true);

		if (args.why)
		{
			const path = findDependencyPath(tree, args.why);
			if (path)
			{
				console.log(` ${chalk.bold(extensionName)} ${chalk.dim('→')} ${path.join(` ${chalk.dim('→')} `)}`);
			}
			else
			{
				console.log(` ${chalk.dim(`${extensionName} does not depend on ${args.why}`)}`);
			}
		}
		else if (args.flat)
		{
			const sorted = [...flatDeps].sort((a, b) => a.name.localeCompare(b.name));

			for (const node of sorted)
			{
				console.log(`  ${node.name}`);
			}
		}
		else
		{
			const treeOutput = formatTree({
				tree,
				rootName: extensionName,
				depth: args.depth,
				unique: true,
			});

			for (const line of treeOutput.split('\n'))
			{
				console.log(` ${line}`);
			}
		}

		console.log('');
		console.log(` ${chalk.dim(`${flatDeps.length} unique ${flatDeps.length === 1 ? 'dependency' : 'dependencies'} in ${duration}s`)}`);
		console.log('');
	});

// endregion

// region: bundle-size

const BUNDLE_SIZE_HOW_IT_WORKS = [
	dim(`Shows the size of compiled ${hi('JS')}, ${hi('CSS')} bundles and ${hi('assets')}`),
	dim(`(images, fonts, SVG) for a single extension.`),
	dim(`Only assets referenced from the bundle are counted.`),
	'',
	dim(`${hi('--with-deps')}  include all transitive dependencies`),
];

const bundleSizeCommand = new Command('bundle-size')
	.description('Show bundle size for an extension')
	.addHelpText('after', '\nHow it works:\n  ' + BUNDLE_SIZE_HOW_IT_WORKS.join('\n  ')
		+ '\n\nExamples:\n  $ chef diag bundle-size ui.buttons\n  $ chef diag bundle-size crm.timeline --with-deps\n')
	.argument('<extension>', 'Extension name (e.g. ui.buttons)')
	.option('--with-deps', 'Include all transitive dependencies')
	.action(async (extensionName: string, args) => {
		if (args.reporter === 'json')
		{
			const result = await diagJson.bundleSize({
				extension: extensionName,
				withDeps: args.withDeps,
			});
			emitJson(result);
			process.exit(result.success ? 0 : 1);
		}

		const start = performance.now();

		const extension: BasePackage | null = PackageResolver.resolve(extensionName);
		if (!extension)
		{
			console.log('');
			console.log(` ${chalk.red('✗')} Extension ${chalk.bold(extensionName)} not found`);
			console.log('');
			return;
		}

		console.log('');
		console.log(` ${chalk.bold(`Bundle size for ${extensionName}`)}`);
		printHowItWorks(BUNDLE_SIZE_HOW_IT_WORKS);

		const ownSize = extension.getBundlesSize();
		const ownAssets = extension.getAssetsSize();
		const ownTotal = ownSize.js + ownSize.css + ownAssets;

		if (args.withDeps)
		{
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

			const depsTotal = depsJs + depsCss + depsAssets;

			console.log('');
			console.log(`  ${chalk.bold('Own bundle:')}`);
			console.log('');
			printSizeRow('JS', ownSize.js);
			printSizeRow('CSS', ownSize.css);
			printSizeRow('Assets', ownAssets);
			printSizeSeparator();
			printSizeRow('Own total', ownTotal, true);

			console.log('');
			console.log(`  ${chalk.bold(`Dependencies (${flatDeps.length}):`)}`);
			console.log('');
			printSizeRow('JS', depsJs);
			printSizeRow('CSS', depsCss);
			printSizeRow('Assets', depsAssets);
			printSizeSeparator();
			printSizeRow('Deps total', depsTotal, true);

			console.log('');
			printSizeSeparator();
			printSizeRow('Grand total', ownTotal + depsTotal, true);
		}
		else
		{
			console.log('');
			printSizeRow('JS', ownSize.js);
			printSizeRow('CSS', ownSize.css);
			printSizeRow('Assets', ownAssets);
			printSizeSeparator();
			printSizeRow('Total', ownTotal, true);
		}

		const duration = ((performance.now() - start) / 1000).toFixed(2);
		console.log('');
		console.log(` ${chalk.dim(`Calculated in ${duration}s`)}`);
		console.log('');
	});

function printSizeRow(label: string, size: number, bold: boolean = false): void
{
	const sizeStr = size > 0 ? formatSize({ size }) : chalk.dim('—');
	const formatted = bold ? chalk.bold(sizeStr) : sizeStr;
	console.log(`  ${label.padEnd(13)} ${formatted}`);
}

function printSizeSeparator(): void
{
	console.log(`  ${chalk.dim('─'.repeat(25))}`);
}

// endregion

// region: baseline

const BASELINE_HOW_IT_WORKS = [
	dim(`Runs the build pipeline (without writing files) and checks each`),
	dim(`source file for JS/CSS features unsupported by the target browsers.`),
	'',
	dim(`Uses the same ${hi('baseline-check')} that runs during ${hi('chef build')}.`),
	dim(`Targets are resolved per-extension from ${hi('bundle.config')},`),
	dim(`${hi('.browserslistrc')}, or the default ${hi('baseline widely available')}.`),
	'',
	dim(`Without arguments: scans all extensions and reports those with issues.`),
	dim(`With arguments: checks only the specified extensions and shows details.`),
];

const BASELINE_CODES: Set<string> = new Set([CF.BASELINE_JS_UNSUPPORTED, CF.BASELINE_CSS_UNSUPPORTED, CF.BASELINE_JS_MAYBE_UNSUPPORTED]);

type FeatureLocation = { file: string; line: number };
type FeatureStat = { count: number; extensions: Map<string, FeatureLocation[]>; label: string; category: 'JS' | 'CSS'; severity: 'error' | 'warning'; code: string; risk: 'low' | 'medium' | 'high'; unsupportedIn?: string; gapInfo?: string; browsersStr?: string };

function printFeatureOverview(featureStats: Map<string, FeatureStat>): void
{
	if (featureStats.size === 0)
	{
		return;
	}

	console.log('');
	console.log(` ${chalk.bold('Features:')}`);

	const riskOrder = { high: 0, medium: 1, low: 2 };
	const sortFn = (a: [string, FeatureStat], b: [string, FeatureStat]) =>
		riskOrder[a[1].risk] - riskOrder[b[1].risk]
		|| (a[1].category === 'JS' ? 0 : 1) - (b[1].category === 'JS' ? 0 : 1)
		|| b[1].extensions.size - a[1].extensions.size
		|| b[1].count - a[1].count;

	const errorFeatures = [...featureStats.entries()].filter(([, s]) => s.severity === 'error').sort(sortFn);
	const warningFeatures = [...featureStats.entries()].filter(([, s]) => s.severity === 'warning').sort(sortFn);

	const rows: string[][] = [];
	for (const [feature, stat] of [...errorFeatures, ...warningFeatures])
	{
		const icon = stat.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
		const extCount = stat.extensions.size;
		const extLabel = extCount === 1 ? 'extension' : 'extensions';

		const detail = stat.gapInfo
			? chalk.dim(stat.gapInfo)
			: stat.unsupportedIn
				? chalk.red(`not supported in ${stat.unsupportedIn}`)
				: '';

		rows.push([
			'',
			icon,
			formatCodeLabel(stat.code, stat.severity),
			chalk.bold(stat.label),
			riskColors[stat.risk](stat.risk),
			detail,
			chalk.dim(`(${extCount} ${extLabel})`),
		]);
	}

	const output = table(rows, {
		align: ['l', 'l', 'l', 'l', 'l', 'l', 'l'],
		stringLength: (str) => stripAnsi(str).length,
	});

	console.log(output);
}

function printFeatureDetails(featureStats: Map<string, FeatureStat>): void
{
	if (featureStats.size === 0)
	{
		return;
	}

	const riskOrder = { high: 0, medium: 1, low: 2 };
	const sortFn = (a: [string, FeatureStat], b: [string, FeatureStat]) =>
		riskOrder[a[1].risk] - riskOrder[b[1].risk]
		|| (a[1].category === 'JS' ? 0 : 1) - (b[1].category === 'JS' ? 0 : 1)
		|| b[1].extensions.size - a[1].extensions.size
		|| b[1].count - a[1].count;

	const errorFeatures = [...featureStats.entries()].filter(([, s]) => s.severity === 'error').sort(sortFn);
	const warningFeatures = [...featureStats.entries()].filter(([, s]) => s.severity === 'warning').sort(sortFn);

	for (const [feature, stat] of [...errorFeatures, ...warningFeatures])
	{
		const icon = stat.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');

		console.log('');
		console.log(` ${icon} ${formatCodeLabel(stat.code, stat.severity)} ${chalk.bold(stat.label)}`);
		console.log('');
		console.log(`   ${formatRiskLine(stat.risk)}`);

		if (stat.browsersStr)
		{
			for (const line of formatBrowserLines(stat.browsersStr, '   '))
			{
				console.log(line);
			}
		}

		console.log(`   ${formatCaniuseLink(feature)}`);

		if (stat.severity === 'warning' && stat.category === 'JS')
		{
			console.log(`   ${chalk.dim('Method name matches a built-in, but may be called on a different object.')}`);
			console.log(`   ${chalk.dim('Use // @chef-ignore to suppress if this is not a built-in call.')}`);
		}

		const names = [...stat.extensions.keys()].sort();
		for (const name of names)
		{
			console.log('');
			console.log(`   ${chalk.dim(name)}`);
			const locations = stat.extensions.get(name) ?? [];
			for (const loc of locations)
			{
				console.log(`     ${chalk.dim('at')} ${loc.file}:${loc.line}`);
			}
		}
	}
}

function formatBreakdown(js: number, css: number): string
{
	const parts: string[] = [];
	if (js > 0)
	{
		parts.push(chalk.cyan(`${js} JS`));
	}

	if (css > 0)
	{
		parts.push(chalk.magenta(`${css} CSS`));
	}

	return parts.join(chalk.dim(', '));
}

const baselineCommand = new Command('baseline')
	.description('Check extensions for browser compatibility issues')
	.addHelpText('after', '\nHow it works:\n  ' + BASELINE_HOW_IT_WORKS.join('\n  ')
		+ '\n\nExamples:\n  $ chef diag baseline\n  $ chef diag baseline ui.bbcode.parser\n  $ chef diag baseline main.core ui.buttons\n')
	.argument('[extensions...]', 'Extensions to check (all if omitted)')
	.addOption(createPathOption('Scan for extensions starting from this directory'))
	.addOption(createIncludeOption())
	.addOption(createExcludeOption())
	.option('--errors-only', 'Show only errors, hide warnings')
	.action(async (extensions: string[], args) => {
		if (extensions.length === 0)
		{
			await checkAllBaseline(args);
		}
		else
		{
			await checkSpecificBaseline(extensions, args);
		}
	});

async function checkAllBaseline(args: { path: string; include?: string[]; exclude?: string[]; errorsOnly?: boolean }): Promise<void>
{
	const hasInclude = args.include && args.include.length > 0;
	const excludeFilter = args.exclude?.length ? createNameFilter({ exclude: args.exclude }) : undefined;
	const fields: Set<SnapshotField> = new Set();
	const { snapshots, duration: collectDuration, scanned } = await collectPackages({
		startDirectory: args.path,
		fields,
		title: 'Baseline compatibility scan',
		howItWorks: BASELINE_HOW_IT_WORKS,
		includePatterns: hasInclude ? args.include : undefined,
		filter: excludeFilter
			? (extension) => excludeFilter(extension.getName())
			: undefined,
	});

	const start = performance.now();
	const spinner = createSpinner(`Checking baseline compatibility... 0/${snapshots.length}`);
	let checked = 0;

	const featureStats = new Map<string, FeatureStat>();
	let totalErrors = 0;
	let totalWarnings = 0;
	let affectedExtensions = 0;

	for (const snapshot of snapshots)
	{
		checked++;
		spinner.update(`Checking baseline compatibility... ${checked}/${snapshots.length}`);

		const extension = PackageResolver.resolve(snapshot.name);
		if (!extension)
		{
			continue;
		}

		try
		{
			const buildResult = await extension.generate({ baseline: true });
			const allIssues = [...buildResult.errors, ...buildResult.warnings]
				.filter((e) => e.code && BASELINE_CODES.has(e.code));
			const issues = args.errorsOnly
				? allIssues.filter((e) => e.code === CF.BASELINE_JS_UNSUPPORTED)
				: allIssues;

			if (issues.length === 0)
			{
				continue;
			}

			affectedExtensions++;

			for (const issue of issues)
			{
				const feature = extractFeatureName(issue.message);
				if (!feature)
				{
					continue;
				}

				const isJs = issue.code === CF.BASELINE_JS_UNSUPPORTED || issue.code === CF.BASELINE_JS_MAYBE_UNSUPPORTED;
				const severity = baselineSeverity(issue.code!);

				if (severity === 'error')
				{
					totalErrors++;
				}
				else
				{
					totalWarnings++;
				}

				const stat = featureStats.get(feature) ?? {
					count: 0,
					extensions: new Map<string, FeatureLocation[]>(),
					label: extractFeatureLabel(issue.message),
					category: isJs ? 'JS' as const : 'CSS' as const,
					severity,
					code: issue.code!,
					risk: (issue.risk ?? 'medium') as 'low' | 'medium' | 'high',
					unsupportedIn: issue.unsupportedIn,
					gapInfo: issue.gapInfo,
					browsersStr: extractBrowsersStr(issue.message),
				};
				stat.count++;
				if (!stat.extensions.has(snapshot.name))
				{
					stat.extensions.set(snapshot.name, []);
				}
				if (issue.loc)
				{
					stat.extensions.get(snapshot.name)!.push({ file: issue.loc.file, line: issue.loc.line });
				}
				featureStats.set(feature, stat);
			}
		}
		catch
		{
			// Skip extensions that fail to build
		}
	}

	spinner.stop();

	if (affectedExtensions === 0)
	{
		console.log('  No baseline compatibility issues found');
	}
	else
	{
		printFeatureOverview(featureStats);
		printFeatureDetails(featureStats);
	}

	const totalIssues = totalErrors + totalWarnings;

	const totalDuration = collectDuration + (performance.now() - start);
	const durationStr = (totalDuration / 1000).toFixed(2);
	console.log('');

	const parts: string[] = [];
	if (totalErrors > 0)
	{
		parts.push(chalk.red(`${totalErrors} error${totalErrors > 1 ? 's' : ''}`));
	}

	if (totalWarnings > 0)
	{
		parts.push(chalk.yellow(`${totalWarnings} warning${totalWarnings > 1 ? 's' : ''}`));
	}

	const breakdownStr = parts.length > 0 ? ` (${parts.join(chalk.dim(', '))})` : '';
	console.log(` ${chalk.dim(`Checked ${snapshots.length} extensions, found ${totalIssues} ${totalIssues === 1 ? 'issue' : 'issues'}`)}${breakdownStr}${chalk.dim(` in ${affectedExtensions} ${affectedExtensions === 1 ? 'extension' : 'extensions'} in ${durationStr}s`)}`);
	console.log('');

	if (affectedExtensions > 0)
	{
		process.exitCode = 1;
	}
}

async function checkSpecificBaseline(extensions: string[], args: { errorsOnly?: boolean } = {}): Promise<void>
{
	const start = performance.now();
	let hasIssues = false;

	console.log('');
	console.log(` ${chalk.bold('Baseline compatibility check')}`);
	printHowItWorks(BASELINE_HOW_IT_WORKS);
	console.log('');

	for (let ei = 0; ei < extensions.length; ei++)
	{
		const name = extensions[ei];
		const extension: BasePackage | null = PackageResolver.resolve(name);
		if (!extension)
		{
			console.log(` ${chalk.red('✗')} ${name} ${chalk.dim('not found')}`);
			continue;
		}

		const progress = extensions.length > 1 ? ` ${ei + 1}/${extensions.length}` : '';
		const spinner = createSpinner(`Checking ${name}...${progress}`);

		try
		{
			const buildResult = await extension.generate({ baseline: true });
			spinner.stop();
			const allIssues = [...buildResult.errors, ...buildResult.warnings]
				.filter((e) => e.code && BASELINE_CODES.has(e.code));
			const issues = args.errorsOnly
				? allIssues.filter((e) => e.code === CF.BASELINE_JS_UNSUPPORTED)
				: allIssues;

			if (issues.length === 0)
			{
				console.log(` ${chalk.green('✓')} ${name} ${chalk.dim('no issues')}`);
			}
			else
			{
				hasIssues = true;
				const jsErrors = issues.filter((e) => e.code === CF.BASELINE_JS_UNSUPPORTED).length;
				const jsMaybe = issues.filter((e) => e.code === CF.BASELINE_JS_MAYBE_UNSUPPORTED).length;
				const css = issues.filter((e) => e.code === CF.BASELINE_CSS_UNSUPPORTED).length;
				const hasErrors = jsErrors > 0;
				const label = issues.length === 1 ? 'issue' : 'issues';
				const icon = hasErrors ? chalk.red('✗') : chalk.yellow('⚠');
				const countColor = hasErrors ? chalk.red : chalk.yellow;
				console.log(` ${icon} ${name} ${countColor(`${issues.length} ${label}`)} ${chalk.dim('(')}${formatBreakdown(jsErrors + jsMaybe, css)}${chalk.dim(')')}`);

				for (let i = 0; i < issues.length; i++)
				{
					const issue = issues[i];

					if (i > 0)
					{
						console.log('');
						console.log(`   ${chalk.dim('─'.repeat(40))}`);
					}

					const severity = baselineSeverity(issue.code!);
					const featureLabel = extractFeatureLabel(issue.message);
					const browsersStr = extractBrowsersStr(issue.message);
					const featureName = extractFeatureName(issue.message);

					console.log('');
					console.log(`     ${formatCodeLabel(issue.code!, severity)} ${featureLabel}`);
					console.log('');

					if (issue.risk)
					{
						console.log(`     ${formatRiskLine(issue.risk)}`);
					}

					if (browsersStr)
					{
						for (const line of formatBrowserLines(browsersStr, '     '))
						{
							console.log(line);
						}
					}

					if (featureName)
					{
						console.log(`     ${formatCaniuseLink(featureName)}`);
					}

					// Code frame
					const errorLines = formatError({
						code: undefined,
						message: '',
						loc: issue.loc ?? undefined,
						frame: issue.loc ? undefined : issue.frame,
					}, '   ');
					const frameLines = errorLines.filter((line) => line.trim() !== '');
					if (frameLines.length > 0)
					{
						console.log('');
						console.log(frameLines.join('\n'));
					}

					if (issue.code === CF.BASELINE_JS_MAYBE_UNSUPPORTED)
					{
						console.log(`     ${chalk.dim('Method name matches a built-in, but may be called on a different object.')}`);
						console.log(`     ${chalk.dim('Use // @chef-ignore to suppress if this is not a built-in call.')}`);
					}
				}

				console.log('');
			}
		}
		catch (error)
		{
			spinner.stop();
			const message = error instanceof Error ? error.message : String(error);
			console.log(` ${chalk.red('✗')} ${name} ${chalk.dim(`build failed: ${message}`)}`);
		}
	}

	const duration = ((performance.now() - start) / 1000).toFixed(2);
	console.log('');
	console.log(` ${chalk.dim(`Checked ${extensions.length} ${extensions.length === 1 ? 'extension' : 'extensions'} in ${duration}s`)}`);
	console.log('');

	if (hasIssues)
	{
		process.exitCode = 1;
	}
}

// endregion

// region: re-exports

const RE_EXPORTS_HOW_IT_WORKS = [
	dim(`Scans source files for ${hi('ES re-exports')} of symbols from ${hi('other extensions')}.`),
	dim(`Detects two forms:`),
	'',
	dim(`  ${hi("export { Foo } from 'ext.name'")}      (direct re-export)`),
	dim(`  ${hi("export * from 'ext.name'")}            (wildcard re-export)`),
	dim(`  ${hi("import { Foo } from 'ext'; export { Foo };")}`),
	dim(`                                       (indirect — same effect)`),
	'',
	dim(`Re-exports into the ${hi('same namespace')} as the source extension`),
	dim(`are flagged: in IIFE bundles with ${hi('extend: true')} this produces`),
	dim(`a self-referential getter and crashes with ${hi('Maximum call stack size exceeded')}.`),
];

const reExportsCommand = new Command('re-exports')
	.description('Find extensions that re-export symbols from other extensions')
	.addHelpText('after', '\nHow it works:\n  ' + RE_EXPORTS_HOW_IT_WORKS.join('\n  ')
		+ '\n\nExamples:\n  $ chef diag re-exports\n  $ chef diag re-exports calendar.*\n  $ chef diag re-exports im.v2.** ui.text-editor\n')
	.argument('[extensions...]', 'Extensions to check (all if omitted)')
	.addOption(createPathOption('Scan for extensions starting from this directory'))
	.addOption(createLimitOption())
	.addOption(createIncludeOption())
	.addOption(createExcludeOption())
	.action(async (extensions: string[], args) => {
		const positionalPatterns = extensions.length > 0 ? extensions : undefined;

		const fields: Set<SnapshotField> = new Set();
		const { snapshots, duration, scanned } = await collectPackages({
			startDirectory: args.path,
			fields,
			title: 'Extensions with re-exports from other extensions',
			howItWorks: RE_EXPORTS_HOW_IT_WORKS,
			includePatterns: positionalPatterns,
		});

		const filtered = filterByName(snapshots, args);

		const analyzeStart = performance.now();
		const analyzeSpinner = createSpinner(`Analyzing re-exports... 0/${filtered.length}`);
		const results = await analyzeReExports(
			filtered,
			(name) => PackageResolver.resolve(name),
			(current, total, name) => {
				analyzeSpinner.update(`Analyzing re-exports... ${current}/${total} ${chalk.dim(name)}`);
			},
		);
		analyzeSpinner.stop();
		const analyzeDuration = performance.now() - analyzeStart;

		const namespaceByName = new Map<string, string>();
		for (const snapshot of snapshots)
		{
			namespaceByName.set(snapshot.name, snapshot.namespace ?? '');
		}

		type Severity = 'critical' | 'wildcard' | 'cross';

		type ClassifiedEntry = {
			source: string;
			sourceNamespace: string;
			symbols: string[];
			wildcard: boolean;
			file: string;
			line: number;
			severity: Severity;
			selfReference: boolean;
		};

		type ClassifiedResult = {
			name: string;
			namespace: string;
			entries: ClassifiedEntry[];
			topSeverity: Severity;
			hasSelfReference: boolean;
		};

		const severityRank: Record<Severity, number> = { critical: 0, wildcard: 1, cross: 2 };

		const classified: ClassifiedResult[] = results.map((result) => {
			const entries: ClassifiedEntry[] = result.entries.map((entry) => {
				const sourceNamespace = namespaceByName.get(entry.source) ?? '';
				const sameNamespace = Boolean(result.namespace) && sourceNamespace === result.namespace;
				const selfReference = entry.source === result.name;

				let severity: Severity;
				if (selfReference || (sameNamespace && !entry.wildcard))
				{
					severity = 'critical';
				}
				else if (sameNamespace && entry.wildcard)
				{
					severity = 'wildcard';
				}
				else
				{
					severity = 'cross';
				}

				return {
					source: entry.source,
					sourceNamespace,
					symbols: entry.symbols,
					wildcard: entry.wildcard,
					file: entry.file,
					line: entry.line,
					severity,
					selfReference,
				};
			});

			const topSeverity: Severity = entries.reduce<Severity>(
				(acc, entry) => (severityRank[entry.severity] < severityRank[acc] ? entry.severity : acc),
				'cross',
			);

			return {
				name: result.name,
				namespace: result.namespace,
				entries,
				topSeverity,
				hasSelfReference: entries.some((e) => e.selfReference),
			};
		});

		classified.sort((a, b) => {
			if (severityRank[a.topSeverity] !== severityRank[b.topSeverity])
			{
				return severityRank[a.topSeverity] - severityRank[b.topSeverity];
			}

			if (a.entries.length !== b.entries.length)
			{
				return b.entries.length - a.entries.length;
			}

			return a.name.localeCompare(b.name);
		});

		const totalCritical = classified.filter((r) => r.topSeverity === 'critical').length;
		const totalWildcard = classified.filter((r) => r.topSeverity === 'wildcard').length;
		const totalCross = classified.filter((r) => r.topSeverity === 'cross').length;
		const totalDuration = (duration + analyzeDuration) / 1000;

		console.log('');

		if (classified.length === 0)
		{
			console.log(` ${chalk.dim(`Scanned ${scanned} extension${scanned === 1 ? '' : 's'}, no re-exports between extensions found in ${totalDuration.toFixed(2)}s`)}`);
			console.log('');

			return;
		}

		const limited = classified.slice(0, args.limit);

		for (const result of limited)
		{
			const marker = result.topSeverity === 'critical'
				? chalk.red('✗')
				: result.topSeverity === 'wildcard' ? chalk.yellow('⚠') : chalk.dim('•');

			const summaryLabel = (() => {
				if (result.hasSelfReference)
				{
					return chalk.red('self-reference');
				}
				if (result.topSeverity === 'critical')
				{
					return chalk.red('same-namespace');
				}
				if (result.topSeverity === 'wildcard')
				{
					return chalk.yellow('same-namespace wildcard');
				}

				return chalk.dim('cross-namespace');
			})();

			const count = result.entries.length;
			const countLabel = chalk.dim(`${count} re-export${count === 1 ? '' : 's'},`);
			console.log(` ${marker} ${chalk.bold(result.name)} ${chalk.dim(`[${result.namespace || 'no namespace'}]`)} ${countLabel} ${summaryLabel}`);

			for (const entry of result.entries)
			{
				const arrow = chalk.cyan('←');
				const sourceLabel = entry.selfReference
					? `${entry.source} ${chalk.red('(self)')}`
					: entry.source;
				const symbolList = entry.symbols.length > 6
					? `${entry.symbols.slice(0, 6).join(', ')}, …(+${entry.symbols.length - 6})`
					: entry.symbols.join(', ');

				console.log(`   ${arrow} ${sourceLabel} ${chalk.dim(`[${entry.sourceNamespace || 'no namespace'}]`)}`);
				console.log(`     ${chalk.dim(`${entry.file}:${entry.line}`)}  ${symbolList}`);
			}

			console.log('');
		}

		const summaryParts: string[] = [];
		if (totalCritical > 0)
		{
			summaryParts.push(chalk.red(`${totalCritical} critical`));
		}
		if (totalWildcard > 0)
		{
			summaryParts.push(chalk.yellow(`${totalWildcard} wildcard`));
		}
		if (totalCross > 0)
		{
			summaryParts.push(chalk.dim(`${totalCross} cross-namespace`));
		}

		const summary = summaryParts.length > 0 ? `found ${summaryParts.join(' / ')}` : 'no re-exports';
		console.log(` ${chalk.dim(`Scanned ${scanned} extension${scanned === 1 ? '' : 's'}, ${summary} in ${totalDuration.toFixed(2)}s`)}`);
		console.log('');
	});

// endregion

const jsonCapableSubcommands: Command[] = [
	topUsedCommand,
	topDepsCommand,
	topDepsTreeCommand,
	topBundleSizeCommand,
	topTotalSizeCommand,
	configCommand,
	unusedDepsCommand,
	circularImportsCommand,
	circularDepsCommand,
	findUsagesCommand,
	findLoadersCommand,
	unusedCommand,
	depsTreeCommand,
	bundleSizeCommand,
];

for (const subcommand of jsonCapableSubcommands)
{
	subcommand.addOption(createReporterOption());
	diagCommand.addCommand(subcommand);
}

diagCommand.addCommand(reExportsCommand);
diagCommand.addCommand(baselineCommand);

export { diagCommand };
