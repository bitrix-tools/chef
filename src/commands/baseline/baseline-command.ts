import { createRequire } from 'node:module';

import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import browserslist from 'browserslist';
import table from 'text-table';
import { Command } from 'commander';

import { createPathOption } from '../../shared/options/path-option';

const browserLabels: Record<string, string> = {
	chrome: 'Chrome',
	edge: 'Edge',
	firefox: 'Firefox',
	safari: 'Safari',
};

function resolveTargetMins(cwd: string): Record<string, number>
{
	const fileTargets = browserslist.loadConfig({ path: cwd });
	const query = fileTargets && fileTargets.length > 0
		? fileTargets
		: 'baseline widely available';

	const resolved = browserslist(query);
	const nameMap: Record<string, string> = {
		chrome: 'chrome',
		edge: 'edge',
		firefox: 'firefox',
		safari: 'safari',
	};

	const mins: Record<string, number> = {};

	for (const entry of resolved)
	{
		const [name, version] = entry.split(' ');
		const browser = nameMap[name];
		if (!browser)
		{
			continue;
		}

		const ver = parseFloat(version);
		if (!mins[browser] || ver < mins[browser])
		{
			mins[browser] = ver;
		}
	}

	return mins;
}

interface SearchResult
{
	id: string;
	name: string;
	matchedBy: string | null;
}

/**
 * Normalizes a compat_features identifier to human-readable form.
 * "javascript.classes.private_class_fields" → "private class fields"
 */
function humanizeCompat(compat: string): string
{
	const lastPart = compat.split('.').pop() ?? compat;

	return lastPart.replace(/_/g, ' ');
}

/**
 * Checks if all query words match within a single compat_features entry
 * as whole words (after normalizing underscores/dots to spaces).
 */
function matchCompat(compat: string, words: string[]): boolean
{
	const compatWords = compat.toLowerCase().replace(/[_.]/g, ' ').split(/\s+/);

	return words.every((w) =>
		compatWords.some((cw) => cw === w || cw.startsWith(w)),
	);
}

function searchFeatures(
	features: Record<string, any>,
	query: string,
): SearchResult[]
{
	const lower = query.toLowerCase();
	const words = lower.split(/\s+/).filter(Boolean);
	const results: Array<SearchResult & { score: number }> = [];

	for (const [id, feature] of Object.entries(features))
	{
		if (!feature.status)
		{
			continue;
		}

		const name = (feature.name ?? id).toLowerCase();
		const desc = (feature.description ?? '').toLowerCase();
		const compat = (feature.compat_features ?? []) as string[];

		let score = 0;
		let matchedBy: string | null = null;

		const normalizedQuery = words.join('-');

		// 1. Exact ID match (with or without hyphens)
		if (id === lower || id === normalizedQuery)
		{
			score = 100;
		}

		// 2. ID contains full query
		if (!score && id.includes(normalizedQuery))
		{
			score = 80;
		}

		// 3. Name contains full query
		if (!score && name.includes(lower))
		{
			score = 70;
		}

		// 4. Compat entry matches all query words
		//    e.g. "private fields" → "javascript.classes.private_class_fields"
		if (!score)
		{
			const matched = compat.find((c) => matchCompat(c, words));
			if (matched)
			{
				score = 65;
				matchedBy = humanizeCompat(matched);
			}
		}

		// 5. All words match in name
		if (!score && words.length > 1 && words.every((w) => name.includes(w)))
		{
			score = 55;
		}

		// 6. Description contains full query
		if (!score && desc.includes(lower))
		{
			score = 40;
		}

		if (score > 0)
		{
			results.push({
				id,
				name: feature.name ?? id,
				matchedBy,
				score,
			});
		}
	}

	results.sort((a, b) => b.score - a.score);

	return results.slice(0, 15);
}

function resolveBcdEntry(bcd: any, path: string): any
{
	let obj = bcd;
	for (const part of path.split('.'))
	{
		obj = obj?.[part];
		if (!obj)
		{
			return null;
		}
	}

	return obj;
}

function getMdnUrl(compatFeatures: string[], featureId?: string): string | null
{
	if (compatFeatures.length === 0)
	{
		return null;
	}

	const require = createRequire(import.meta.url);
	const bcd = require('@mdn/browser-compat-data');

	const normalizedId = (featureId ?? '').toLowerCase().replace(/-/g, '_');

	let bestUrl: string | null = null;
	let bestScore = -1;

	for (const path of compatFeatures)
	{
		const entry = resolveBcdEntry(bcd, path);
		const url = entry?.__compat?.mdn_url;
		if (!url)
		{
			continue;
		}

		// Split camelCase into words: MediaSession → media_session
		const normalizedPath = path.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/-/g, '_');
		const lastSegment = normalizedPath.split('.').pop() ?? '';

		const idParts = normalizedId.split('_');
		const pathParts = normalizedPath.split(/[._]/);

		let score = 0;

		// Exact match of last segment with feature ID
		if (lastSegment === normalizedId)
		{
			score = 100;
		}
		// Last segment contains feature ID
		else if (lastSegment.includes(normalizedId))
		{
			score = 80;
		}
		else
		{
			// Word overlap: how many ID words start-match path words
			const overlap = idParts.filter((w) => w.length > 2 && pathParts.some((p) => p.startsWith(w))).length;

			if (overlap > 0)
			{
				score = 30 + overlap * 10;
			}
		}

		// Prefer shorter paths (more general) as tiebreaker
		score += (10 - Math.min(path.split('.').length, 10)) * 0.1;

		if (score > bestScore)
		{
			bestScore = score;
			bestUrl = url;
		}
	}

	return bestUrl;
}

function getCategory(compat: string[]): string
{
	if (compat.length === 0)
	{
		return chalk.dim('···');
	}

	if (compat.every((c) => c.startsWith('javascript.')))
	{
		return chalk.cyan('JS');
	}

	if (compat.every((c) => c.startsWith('css.')))
	{
		return chalk.magenta('CSS');
	}

	if (compat.every((c) => c.startsWith('api.')))
	{
		return chalk.blue('API');
	}

	if (compat.every((c) => c.startsWith('html.')))
	{
		return chalk.yellow('HTML');
	}

	return chalk.dim('···');
}

function formatBaseline(baseline: string | null): string
{
	if (baseline === 'high')
	{
		return chalk.green('Widely Available');
	}

	if (baseline === 'low')
	{
		return chalk.yellow('Newly Available');
	}

	return chalk.red('No');
}

type FeatureStatus = 'supported' | 'transpiled' | 'unsupported';

const coreBrowsers = ['chrome', 'edge', 'firefox', 'safari'] as const;

function getFeatureStatus(feat: any, targetMins: Record<string, number>): FeatureStatus
{
	const support = feat.status?.support ?? {};
	const jsFeature = isJavaScriptFeature(feat);
	const babelSyntax = jsFeature && isBabelTranspilable(feat);
	const babelVersions = babelSyntax ? getBabelAnalysis(feat)?.maxVersions : null;

	const nativeSupported = coreBrowsers.every((b) => {
		const required = babelVersions?.[b]
			?? parseInt(support[b] ?? '0', 10);
		const target = targetMins[b] ?? 0;

		return !required || target >= required;
	});

	if (nativeSupported)
	{
		return 'supported';
	}

	if (babelSyntax)
	{
		return 'transpiled';
	}

	return 'unsupported';
}

function formatStatus(status: FeatureStatus): { icon: string; text: string }
{
	switch (status)
	{
		case 'supported':
			return { icon: chalk.green('✓'), text: chalk.green('supported') };
		case 'transpiled':
			return { icon: chalk.yellow('~'), text: chalk.cyan('transpiled') };
		case 'unsupported':
			return { icon: chalk.red('✗'), text: chalk.red('unsupported') };
	}
}

function printTable(rows: string[][]): void
{
	const output = table(rows, {
		stringLength: (str) => stripAnsi(str).length,
	});

	for (const line of output.split('\n'))
	{
		console.log(`  ${line}`);
	}
}

function getRawCategory(compat: string[]): string
{
	if (compat.length === 0)
	{
		return 'Other';
	}

	if (compat.every((c) => c.startsWith('javascript.')))
	{
		return 'JavaScript';
	}

	if (compat.every((c) => c.startsWith('css.')))
	{
		return 'CSS';
	}

	if (compat.every((c) => c.startsWith('api.')))
	{
		return 'API';
	}

	if (compat.every((c) => c.startsWith('html.')))
	{
		return 'HTML';
	}

	return 'Other';
}

const categoryOrder = ['JavaScript', 'CSS', 'API', 'HTML', 'Other'];

function showFeatureList(features: Record<string, any>, targetMins: Record<string, number>): void
{
	const groups: Map<string, Array<{ id: string; status: FeatureStatus; compat: string[] }>> = new Map();
	let supportedCount = 0;
	let transpiledCount = 0;

	for (const [id, feat] of Object.entries(features))
	{
		if (!feat.status)
		{
			continue;
		}

		const status = getFeatureStatus(feat, targetMins);
		if (status === 'unsupported')
		{
			continue;
		}

		const compat = (feat.compat_features ?? []) as string[];
		const category = getRawCategory(compat);

		if (!groups.has(category))
		{
			groups.set(category, []);
		}

		groups.get(category)!.push({ id, status, compat });

		if (status === 'supported')
		{
			supportedCount++;
		}
		else
		{
			transpiledCount++;
		}
	}

	for (const cat of categoryOrder)
	{
		const items = groups.get(cat);
		if (!items)
		{
			continue;
		}

		items.sort((a, b) => a.id.localeCompare(b.id));

		console.log(`  ${chalk.dim(`${cat} (${items.length})`)}`);
		console.log('');

		const rows: string[][] = [];
		for (const { id, status, compat } of items)
		{
			const { icon, text } = formatStatus(status);
			rows.push([icon, getCategory(compat), chalk.bold(id), text]);
		}

		printTable(rows);
		console.log('');
	}

	const total = Object.values(features).filter((f) => f.status).length;
	console.log(chalk.dim(`  ${supportedCount} supported, ${transpiledCount} transpiled, ${total - supportedCount - transpiledCount} unsupported`));
	console.log('');
}

const baselineCommand = new Command('baseline');

baselineCommand
	.description('Check if a web feature is supported by current browser targets')
	.argument('[query]', 'Feature ID or search query (e.g. subgrid, "container queries", grid)')
	.option('--list', 'List all supported and transpiled features')
	.addOption(createPathOption('Path to project or extension directory'))
	.action(async (query: string | undefined, options: { path?: string; list?: boolean }) => {
		const { features } = await import('web-features');

		if (options.list || !query)
		{
			const cwd = options.path ?? process.cwd();
			const targetMins = resolveTargetMins(cwd);

			console.log('');
			showFeatureList(features, targetMins);

			return;
		}

		// Exact match — show full details
		const feature = features[query];
		if (feature)
		{
			showFeatureDetails(query, feature, options.path);

			return;
		}

		// Search
		const results = searchFeatures(features, query);

		if (results.length === 0)
		{
			console.log('');
			console.log(chalk.red(`  No features found for "${query}"`));
			console.log(`  Browse: ${chalk.dim('https://webstatus.dev/features')}`);
			console.log('');

			return;
		}

		if (results.length === 1 && !results[0].matchedBy)
		{
			showFeatureDetails(results[0].id, features[results[0].id], options.path);

			return;
		}

		// Multiple results — show list
		const cwd = options.path ?? process.cwd();
		const targetMins = resolveTargetMins(cwd);

		console.log('');
		console.log(`  Results for "${query}":`);
		console.log('');

		const rows: string[][] = [];

		for (const result of results)
		{
			const feat = features[result.id] as any;
			const status = getFeatureStatus(feat, targetMins);
			const { icon, text } = formatStatus(status);

			const compat = (feat.compat_features ?? []) as string[];
			const category = getCategory(compat);
			const match = result.matchedBy ? chalk.dim(`(${result.matchedBy})`) : '';
			const mdnLink = getMdnUrl(compat, result.id);
			const link = mdnLink ? chalk.dim(`→ ${mdnLink}`) : '';

			rows.push([icon, category, chalk.bold(result.id), text, match, link]);
		}

		printTable(rows);

		console.log('');
		console.log(chalk.dim('  Run chef baseline <id> for details'));
		console.log('');
	});

/**
 * Checks if a JS feature is a syntax transform covered by Babel preset-env.
 *
 * Heuristic: features whose compat_features are all `javascript.statements.*`,
 * `javascript.operators.*`, `javascript.classes.*`, or `javascript.functions.*`
 * are syntax features that Babel can transpile.
 *
 * Features with `javascript.builtins.*` are runtime APIs (Promise.any, Array.at)
 * that require polyfills, not Babel transforms.
 */
function isBabelTranspilable(feature: any): boolean
{
	const compat = feature.compat_features ?? [];
	if (compat.length === 0)
	{
		return false;
	}

	const syntaxCategories = [
		'javascript.statements',
		'javascript.operators',
		'javascript.classes',
		'javascript.functions',
		'javascript.grammar',
	];

	return compat.every((c: string) =>
		syntaxCategories.some((cat) => c === cat || c.startsWith(cat + '.')),
	);
}

function isJavaScriptFeature(feature: any): boolean
{
	const compat = feature.compat_features ?? [];

	return compat.length > 0 && compat.every((c: string) => c.startsWith('javascript.'));
}

function isCssFeature(feature: any): boolean
{
	const compat = feature.compat_features ?? [];

	return compat.length > 0 && compat.every((c: string) => c.startsWith('css.'));
}

/**
 * For a JS syntax feature, returns the real minimum browser versions
 * based on Babel compat-data (highest version across related transforms).
 *
 * This is more accurate than web-features for aggregated features like
 * "class-syntax" where web-features reports Chrome 42 (basic classes)
 * but private fields actually need Chrome 74.
 */
interface BabelTransformInfo
{
	plugin: string;
	versions: Record<string, number>;
	compatEntry: string | null;
}

interface BabelAnalysis
{
	maxVersions: Record<string, number>;
	transforms: BabelTransformInfo[];
}

function getBabelAnalysis(feature: any): BabelAnalysis | null
{
	const compat: string[] = feature.compat_features ?? [];
	if (compat.length === 0)
	{
		return null;
	}

	const require = createRequire(import.meta.url);
	const plugins = require('@babel/compat-data/plugins') as Record<string, Record<string, string>>;
	const coreBrowsers = ['chrome', 'edge', 'firefox', 'safari'];

	// Map compat_features keywords to Babel plugin names
	const keywordMap: Record<string, string[]> = {
		'private_class_fields': ['transform-class-properties'],
		'private_class_methods': ['transform-private-methods'],
		'private_class_fields_in': ['transform-private-property-in-object'],
		'public_class_fields': ['transform-class-properties'],
		'static_initialization_blocks': ['transform-class-static-block'],
		'initialization_blocks': ['transform-class-static-block'],
		'optional_chaining': ['transform-optional-chaining'],
		'nullish_coalescing': ['transform-nullish-coalescing-operator'],
		'logical_assignment': ['transform-logical-assignment-operators'],
		'numeric_separator': ['transform-numeric-separator'],
		'async_function': ['transform-async-to-generator'],
		'async_generator': ['transform-async-generator-functions'],
		'rest_parameters': ['transform-parameters'],
		'default_parameters': ['transform-parameters'],
		'spread': ['transform-spread'],
		'destructuring': ['transform-destructuring'],
		'arrow_functions': ['transform-arrow-functions'],
		'template_literals': ['transform-template-literals'],
		'for_of': ['transform-for-of'],
		'classes': ['transform-classes'],
		'exponentiation': ['transform-exponentiation-operator'],
		'object_rest_spread': ['transform-object-rest-spread'],
	};

	// plugin → first compat entry that matched it
	const pluginToCompat = new Map<string, string>();

	for (const cf of compat)
	{
		const parts = cf.toLowerCase().split('.');
		for (const part of parts)
		{
			if (Object.hasOwn(keywordMap, part))
			{
				for (const p of keywordMap[part])
				{
					if (!pluginToCompat.has(p))
					{
						pluginToCompat.set(p, cf);
					}
				}
			}
		}
	}

	if (pluginToCompat.size === 0)
	{
		return null;
	}

	const maxVersions: Record<string, number> = {};
	const transforms: BabelTransformInfo[] = [];

	for (const [pluginName, compatEntry] of pluginToCompat)
	{
		const data = plugins[pluginName];
		if (!data)
		{
			continue;
		}

		const versions: Record<string, number> = {};
		for (const browser of coreBrowsers)
		{
			const ver = parseFloat(data[browser] ?? '0');
			if (ver > 0)
			{
				versions[browser] = ver;
			}

			if (ver > (maxVersions[browser] ?? 0))
			{
				maxVersions[browser] = ver;
			}
		}

		transforms.push({ plugin: pluginName, versions, compatEntry });
	}

	transforms.sort((a, b) => {
		const maxA = Math.max(...Object.values(a.versions));
		const maxB = Math.max(...Object.values(b.versions));

		return maxB - maxA;
	});

	return Object.keys(maxVersions).length > 0
		? { maxVersions, transforms }
		: null;
}

function showFeatureDetails(featureId: string, feature: any, pathOption?: string): void
{
	const cwd = pathOption ?? process.cwd();
	const targetMins = resolveTargetMins(cwd);

	const support = feature.status?.support ?? {};
	const coreBrowsers = ['chrome', 'edge', 'firefox', 'safari'] as const;
	const jsFeature = isJavaScriptFeature(feature);
	const cssFeature = isCssFeature(feature);
	const babelSyntax = jsFeature && isBabelTranspilable(feature);
	const babel = babelSyntax ? getBabelAnalysis(feature) : null;
	const babelRequired = babel?.maxVersions ?? null;

	console.log('');
	console.log(`  ${chalk.bold(feature.name ?? featureId)}`);

	if (feature.description)
	{
		const desc = feature.description
			.replace(/<[^>]+>/g, '')
			.replace(/&[^;]+;/g, '')
			.trim();

		if (desc)
		{
			console.log(`  ${chalk.dim(desc)}`);
		}
	}

	console.log('');

	console.log(`  Baseline: ${formatBaseline(feature.status?.baseline)}`);

	if (jsFeature)
	{
		console.log(`  Category: ${chalk.cyan('JavaScript')}`);
	}
	else if (cssFeature)
	{
		console.log(`  Category: ${chalk.magenta('CSS')}`);
	}
	console.log('');

	let allNative = true;
	let hasBabelCoverage = true;

	for (const browser of coreBrowsers)
	{
		const label = browserLabels[browser];
		const required = babelRequired?.[browser]
			?? parseInt(support[browser] ?? '0', 10);
		const target = targetMins[browser] ?? 0;

		if (!required)
		{
			console.log(`    ${label.padEnd(12)} ${chalk.dim('no data')}`);
			continue;
		}

		const native = target >= required;
		if (!native)
		{
			allNative = false;
		}

		if (native)
		{
			console.log(`  ${chalk.green('✓')} ${label.padEnd(12)} ${chalk.dim(`requires ${required}, target ${target}`)}`);
		}
		else if (babelSyntax)
		{
			console.log(`  ${chalk.yellow('~')} ${label.padEnd(12)} requires ${chalk.bold(String(required))}, target ${chalk.yellow(String(target))} ${chalk.cyan('(Babel)')}`);
		}
		else
		{
			hasBabelCoverage = false;
			console.log(`  ${chalk.red('✗')} ${label.padEnd(12)} requires ${chalk.bold(String(required))}, target ${chalk.red(String(target))}`);
		}
	}

	console.log('');

	if (babel && babel.transforms.length > 1 && !allNative)
	{
		console.log(`  ${chalk.dim('Babel transforms:')}`)

		const require = createRequire(import.meta.url);
		const bcd = require('@mdn/browser-compat-data');

		for (const transform of babel.transforms)
		{
			const native = Object.entries(transform.versions).every(
				([browser, ver]) => (targetMins[browser] ?? 0) >= ver,
			);
			const icon = native ? chalk.green('✓') : chalk.yellow('~');
			const label = native ? chalk.dim('native') : chalk.cyan('transpiled');
			const name = transform.plugin.replace('transform-', '');

			let mdnLink = '';
			if (transform.compatEntry)
			{
				const entry = resolveBcdEntry(bcd, transform.compatEntry);
				const url = entry?.__compat?.mdn_url;
				if (url)
				{
					mdnLink = chalk.dim(` → ${url}`);
				}
			}

			console.log(`  ${icon} ${name.padEnd(35)} ${label}${mdnLink}`);
		}

		console.log('');
	}

	if (allNative)
	{
		if (babelSyntax)
		{
			console.log(`  ${chalk.green('✓')} Supported natively by current targets`);
		}
		else
		{
			console.log(`  ${chalk.green('✓')} Safe to use with current targets`);
		}
	}
	else if (babelSyntax && hasBabelCoverage)
	{
		console.log(`  ${chalk.green('✓')} Babel will transpile for older browsers`);
	}
	else if (jsFeature)
	{
		console.log(`  ${chalk.red('✗')} Not supported by current targets`);
		console.log(`  ${chalk.dim('  Runtime API — Babel does not transpile, requires a polyfill')}`);
	}
	else if (cssFeature)
	{
		console.log(`  ${chalk.red('✗')} Not supported by current targets`);
		console.log(`  ${chalk.dim('  CSS — not transpilable, consider a fallback')}`);
	}
	else
	{
		console.log(`  ${chalk.red('✗')} Not supported by current targets`);
	}

	console.log('');

	const mdnUrl = getMdnUrl(feature.compat_features ?? [], featureId);
	if (mdnUrl)
	{
		console.log(`  ${chalk.dim(mdnUrl)}`);
	}
	console.log(`  ${chalk.dim(`https://webstatus.dev/features/${featureId}`)}`);

	console.log('');
}

export { baselineCommand };
