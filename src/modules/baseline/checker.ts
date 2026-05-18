import { buildBcdIndex, formatInstanceOwners, loadBcd } from './bcd-index';
import { extractFeatureUsages } from './ast-walker';
import { checkCss } from './css-checker';
import { collectIgnoredLines } from './ignore';
import { calculateRisk, getUnsupportedBrowsers, isSupported } from './support';
import { resolveTargetMins } from './targets';

import type { BaselineWarning, BcdData, BrowserVersions, CompatEntry, FeatureUsage } from './types';

const JS_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);

function getExtension(id: string): string
{
	const dot = id.lastIndexOf('.');

	return dot >= 0 ? id.slice(dot) : '';
}

function resolveBcdEntry(bcd: BcdData, path: string[]): CompatEntry | undefined
{
	let node: any = bcd;
	for (const segment of path)
	{
		if (!node || typeof node !== 'object')
		{
			return undefined;
		}

		node = node[segment];
	}

	return node?.__compat ? (node as CompatEntry) : undefined;
}

function buildWarning(usage: FeatureUsage, entry: CompatEntry, targetMins: BrowserVersions): BaselineWarning | null
{
	if (isSupported(entry, targetMins))
	{
		return null;
	}

	const unsupported = getUnsupportedBrowsers(entry, targetMins);
	const risk = calculateRisk(entry, targetMins);

	let message: string;
	let severity: BaselineWarning['severity'] = 'error';

	switch (usage.kind)
	{
		case 'static':
			message = `${usage.label}() is not supported by targets: ${unsupported.join(', ')}`;
			break;
		case 'constructor':
			message = `${usage.label} is not supported by targets: ${unsupported.join(', ')}`;
			break;
		case 'global':
			message = `${usage.label}() is not supported by targets: ${unsupported.join(', ')}`;
			break;
		case 'instanceMethod':
			severity = 'warning';
			message = `${usage.label} may not be supported by targets (${usage.ownerLabel}): ${unsupported.join(', ')}`;
			break;
		case 'syntax':
			message = `${usage.label} is not supported by targets: ${unsupported.join(', ')}`;
			break;
		default:
			return null;
	}

	return {
		message,
		severity,
		...risk,
		line: usage.line,
		column: usage.column,
	};
}

export interface CheckCodeOptions
{
	code: string;
	id: string;
	targets: BrowserVersions | string[];
}

/**
 * Checks a single source file against the given browser targets and returns
 * baseline-violation warnings. Used by the rollup build plugin and by
 * standalone diagnostics commands so that both share identical results.
 */
export function checkCode(options: CheckCodeOptions): BaselineWarning[]
{
	const ext = getExtension(options.id);
	const targetMins: BrowserVersions = Array.isArray(options.targets)
		? resolveTargetMins(options.targets)
		: options.targets;

	if (Object.keys(targetMins).length === 0)
	{
		return [];
	}

	const warnings: BaselineWarning[] = [];

	if (ext === '.css')
	{
		checkCss(options.code, targetMins, warnings);

		return warnings;
	}

	if (!JS_EXTENSIONS.has(ext))
	{
		return [];
	}

	if (options.id.includes('node_modules'))
	{
		return [];
	}

	const bcd = loadBcd();
	const index = buildBcdIndex(bcd);
	const ignored = collectIgnoredLines(options.code);

	const usages = extractFeatureUsages(options.code, options.id, index);
	for (const usage of usages)
	{
		if (ignored.has(usage.line))
		{
			continue;
		}

		let entry: CompatEntry | undefined;
		let ownerLabel = usage.ownerLabel;

		if (usage.kind === 'instanceMethod')
		{
			// Multiple owners share a method name (e.g. `.some()` exists on Array,
			// TypedArray, and Iterator). Without type information we can't tell
			// which one is called, so we report a warning ONLY when no owner has
			// supported it at the targets — otherwise an old method like
			// `Array.prototype.some` (supported everywhere) would falsely warn
			// just because the new `Iterator.prototype.some` (Chrome 122+) is
			// also indexed under the same key.
			const methodName = usage.label.slice(1, -2);
			const owners = index.instanceMethods.get(methodName);
			if (!owners || owners.length === 0)
			{
				continue;
			}

			const anySupported = owners.some((o) => isSupported(o.entry, targetMins));
			if (anySupported)
			{
				continue;
			}

			// All owners are unsupported — pick the first one for the warning entry.
			entry = owners[0].entry;
			ownerLabel = formatInstanceOwners(methodName, owners);
		}
		else
		{
			entry = resolveBcdEntry(bcd, usage.bcdPath);
		}

		if (!entry)
		{
			continue;
		}

		const warning = buildWarning({ ...usage, ownerLabel }, entry, targetMins);
		if (warning)
		{
			warnings.push(warning);
		}
	}

	return warnings;
}

export { resolveTargetMins } from './targets';
export { isSupported, getUnsupportedBrowsers, calculateRisk } from './support';
export { loadBcd, buildBcdIndex } from './bcd-index';
export type { BaselineWarning, BrowserVersions, BcdData, CompatEntry, FeatureUsage } from './types';
