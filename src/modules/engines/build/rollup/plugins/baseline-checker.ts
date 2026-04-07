import { createRequire } from 'node:module';

export interface BrowserVersions {
	chrome?: number;
	edge?: number;
	firefox?: number;
	safari?: number;
}

export interface SupportRecord {
	version_added?: string | boolean;
	prefix?: string;
}

export interface CompatEntry {
	__compat?: {
		support?: Record<string, SupportRecord | SupportRecord[]>;
	};
}

export type BcdData = {
	javascript: { builtins: Record<string, Record<string, CompatEntry>> };
	css: {
		properties: Record<string, CompatEntry>;
		'at-rules': Record<string, CompatEntry & Record<string, CompatEntry>>;
		selectors: Record<string, CompatEntry>;
		types: Record<string, CompatEntry>;
	};
	api: Record<string, CompatEntry>;
};

export type BaselineSeverity = 'error' | 'warning';
export type BaselineRisk = 'low' | 'medium' | 'high';

export interface BaselineWarning {
	message: string;
	severity: BaselineSeverity;
	risk: BaselineRisk;
	unsupportedIn?: string;
	gapInfo?: string;
	line: number;
	column: number;
}

// Instance methods that may conflict with user-defined methods are not checked.
// Only methods with distinctive names that are unlikely to be user-defined.
const instanceMethodOwners: Record<string, string[]> = {
	at: ['Array', 'String', 'TypedArray'],
	findLast: ['Array', 'TypedArray'],
	findLastIndex: ['Array', 'TypedArray'],
	toReversed: ['Array', 'TypedArray'],
	toSorted: ['Array', 'TypedArray'],
	toSpliced: ['Array'],
	replaceAll: ['String'],
	isWellFormed: ['String'],
	toWellFormed: ['String'],
	// Set methods
	difference: ['Set'],
	intersection: ['Set'],
	isDisjointFrom: ['Set'],
	isSubsetOf: ['Set'],
	isSupersetOf: ['Set'],
	symmetricDifference: ['Set'],
	union: ['Set'],
};

// Static methods: Object.method or Class.method
const staticMethods: Record<string, string[]> = {
	Object: ['hasOwn', 'groupBy'],
	Array: ['fromAsync'],
	Promise: ['allSettled', 'any', 'withResolvers'],
	Map: ['groupBy'],
	Iterator: ['from'],
};

// Global functions/constructors
const globalApis: string[] = [
	'structuredClone',
	'reportError',
	'Scheduler',
];

export function resolveTargetMins(targets: string[]): BrowserVersions
{
	const mins: BrowserVersions = {};

	const nameMap: Record<string, keyof BrowserVersions> = {
		chrome: 'chrome',
		edge: 'edge',
		firefox: 'firefox',
		safari: 'safari',
	};

	for (const target of targets)
	{
		const match = target.match(/^([a-z_]+)\s+([\d.]+)$/);
		if (!match)
		{
			continue;
		}

		const [, name, versionStr] = match;
		const browser = nameMap[name];
		if (!browser)
		{
			continue;
		}

		const version = parseFloat(versionStr);
		if (mins[browser] === undefined || version < mins[browser])
		{
			mins[browser] = version;
		}
	}

	return mins;
}

function isBrowserSupported(records: SupportRecord | SupportRecord[], minVersion: number, withPrefixes: boolean): boolean
{
	const list = Array.isArray(records) ? records : [records];
	const standard = list.find((r) => !r.prefix);

	if (standard)
	{
		if (standard.version_added === false)
		{
			// Not supported natively — check prefixed fallback
		}
		else if (typeof standard.version_added === 'string' && parseFloat(standard.version_added) > minVersion)
		{
			// Not yet supported natively — check prefixed fallback
		}
		else
		{
			return true;
		}
	}

	if (withPrefixes)
	{
		for (const record of list)
		{
			if (!record.prefix)
			{
				continue;
			}

			if (record.version_added === true)
			{
				return true;
			}

			if (typeof record.version_added === 'string' && parseFloat(record.version_added) <= minVersion)
			{
				return true;
			}
		}
	}

	return false;
}

function isSupported(entry: CompatEntry | undefined, targetMins: BrowserVersions, withPrefixes = false): boolean
{
	if (!entry?.__compat?.support)
	{
		return true;
	}

	const support = entry.__compat.support;

	for (const [browser, minVersion] of Object.entries(targetMins))
	{
		const browserSupport = support[browser];
		if (!browserSupport)
		{
			continue;
		}

		if (!isBrowserSupported(browserSupport, minVersion, withPrefixes))
		{
			return false;
		}
	}

	return true;
}

function getUnsupportedBrowsers(entry: CompatEntry | undefined, targetMins: BrowserVersions, withPrefixes = false): string[]
{
	if (!entry?.__compat?.support)
	{
		return [];
	}

	const support = entry.__compat.support;
	const unsupported: string[] = [];

	const labels: Record<string, string> = {
		chrome: 'Chrome',
		edge: 'Edge',
		firefox: 'Firefox',
		safari: 'Safari',
	};

	for (const [browser, minVersion] of Object.entries(targetMins))
	{
		const browserSupport = support[browser];
		if (!browserSupport)
		{
			continue;
		}

		if (isBrowserSupported(browserSupport, minVersion, withPrefixes))
		{
			continue;
		}

		const list = Array.isArray(browserSupport) ? browserSupport : [browserSupport];
		const standard = list.find((r) => !r.prefix);
		const added = standard?.version_added;

		if (added === false)
		{
			unsupported.push(`${labels[browser]} ${minVersion}`);
		}
		else if (typeof added === 'string' && parseFloat(added) > minVersion)
		{
			unsupported.push(`${labels[browser]} ${minVersion} (available from ${added})`);
		}
		else
		{
			unsupported.push(`${labels[browser]} ${minVersion}`);
		}
	}

	return unsupported;
}

function getRequiredVersion(entry: CompatEntry, browser: string, withPrefixes: boolean): number | null
{
	const records = entry.__compat?.support?.[browser];
	if (!records)
	{
		return null;
	}

	const list = Array.isArray(records) ? records : [records];
	const standard = list.find((r) => !r.prefix);

	if (standard && typeof standard.version_added === 'string')
	{
		return parseFloat(standard.version_added);
	}

	if (standard && standard.version_added === false && withPrefixes)
	{
		for (const record of list)
		{
			if (record.prefix && typeof record.version_added === 'string')
			{
				return parseFloat(record.version_added);
			}
		}
	}

	return null;
}

export interface RiskInfo
{
	risk: BaselineRisk;
	unsupportedIn?: string;
	gapInfo?: string;
}

const browserLabelsShort: Record<string, string> = {
	chrome: 'Chrome',
	edge: 'Edge',
	firefox: 'Firefox',
	safari: 'Safari',
};

// Version gap multipliers: normalizes version numbers to comparable units.
// Chrome/Edge/Firefox release ~12 major versions per year.
// Safari releases ~1 major version per year, so gap of 1 ≈ gap of 12 in Chrome.
const versionGapMultiplier: Record<string, number> = {
	chrome: 1,
	edge: 1,
	firefox: 1,
	safari: 12,
};

export function calculateRisk(entry: CompatEntry | undefined, targetMins: BrowserVersions, withPrefixes = false): RiskInfo
{
	if (!entry?.__compat?.support)
	{
		return { risk: 'low' };
	}

	const support = entry.__compat.support;
	const unsupportedBrowsers: string[] = [];
	let maxNormalizedGap = 0;
	let maxGapBrowser = '';
	let maxGapMin = 0;
	let maxGapRequired = 0;

	for (const [browser, minVersion] of Object.entries(targetMins))
	{
		const browserSupport = support[browser];
		if (!browserSupport)
		{
			continue;
		}

		const list = Array.isArray(browserSupport) ? browserSupport : [browserSupport];
		const standard = list.find((r) => !r.prefix);
		const hasNativeSupport = standard && standard.version_added !== false;
		const hasPrefixedSupport = withPrefixes && list.some((r) => r.prefix && r.version_added !== false);

		if (!hasNativeSupport && !hasPrefixedSupport)
		{
			unsupportedBrowsers.push(browserLabelsShort[browser] ?? browser);
			continue;
		}

		const requiredVersion = getRequiredVersion(entry, browser, withPrefixes);
		if (requiredVersion !== null && requiredVersion > minVersion)
		{
			const rawGap = requiredVersion - minVersion;
			const gap = rawGap * (versionGapMultiplier[browser] ?? 1);
			if (gap > maxNormalizedGap)
			{
				maxNormalizedGap = gap;
				maxGapBrowser = browserLabelsShort[browser] ?? browser;
				maxGapMin = minVersion;
				maxGapRequired = requiredVersion;
			}
		}
	}

	const unsupportedIn = unsupportedBrowsers.length > 0
		? unsupportedBrowsers.join(', ')
		: undefined;

	const gapInfo = maxGapRequired > 0
		? `${maxGapBrowser} ${maxGapMin} → ${maxGapRequired}`
		: undefined;

	if (unsupportedBrowsers.length > 0)
	{
		return { risk: 'high', unsupportedIn, gapInfo };
	}

	if (maxNormalizedGap > 12)
	{
		return { risk: 'high', gapInfo };
	}

	if (maxNormalizedGap > 4)
	{
		return { risk: 'medium', gapInfo };
	}

	return { risk: 'low', gapInfo };
}

export function loadBcd(): BcdData
{
	const require = createRequire(import.meta.url);

	return require('@mdn/browser-compat-data') as BcdData;
}

export function buildInstanceMethodMap(bcd: BcdData): Map<string, CompatEntry>
{
	const map = new Map<string, CompatEntry>();

	for (const [methodName, owners] of Object.entries(instanceMethodOwners))
	{
		for (const owner of owners)
		{
			const entry = bcd.javascript.builtins[owner]?.[methodName];
			if (entry?.__compat)
			{
				map.set(methodName, entry);
				break;
			}
		}
	}

	return map;
}

export function checkJavaScript(
	code: string,
	bcd: BcdData,
	targetMins: BrowserVersions,
	instanceMethodMap: Map<string, CompatEntry>,
	warnings: BaselineWarning[],
): void
{
	const lines = code.split('\n');

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++)
	{
		const line = lines[lineIndex];

		const trimmed = line.trim();
		if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'))
		{
			continue;
		}

		if (line.includes('@chef-ignore') || lines[lineIndex - 1]?.includes('@chef-ignore'))
		{
			continue;
		}

		for (const api of globalApis)
		{
			const regex = new RegExp(`\\b${api}\\b`);
			const match = regex.exec(line);
			if (match)
			{
				const entry = bcd.api[api];
				if (!isSupported(entry, targetMins))
				{
					const unsupported = getUnsupportedBrowsers(entry, targetMins);
					warnings.push({
						message: `${api}() is not supported by targets: ${unsupported.join(', ')}`,
						severity: 'error',
						...calculateRisk(entry, targetMins),
						line: lineIndex + 1,
						column: match.index,
					});
				}
			}
		}

		for (const [objectName, methods] of Object.entries(staticMethods))
		{
			for (const method of methods)
			{
				const pattern = `${objectName}.${method}`;
				const idx = line.indexOf(pattern);
				if (idx === -1)
				{
					continue;
				}

				const before = idx > 0 ? line[idx - 1] : ' ';
				const after = line[idx + pattern.length] ?? ' ';
				if (/\w/.test(before) || /\w/.test(after))
				{
					continue;
				}

				const entry = bcd.javascript.builtins[objectName]?.[method];
				if (!isSupported(entry, targetMins))
				{
					const unsupported = getUnsupportedBrowsers(entry, targetMins);
					warnings.push({
						message: `${pattern}() is not supported by targets: ${unsupported.join(', ')}`,
						severity: 'error',
						...calculateRisk(entry, targetMins),
						line: lineIndex + 1,
						column: idx,
					});
				}
			}
		}

		for (const [methodName, entry] of instanceMethodMap)
		{
			const regex = new RegExp(`\\.${methodName}\\s*\\(`, 'g');
			let match;
			while ((match = regex.exec(line)) !== null)
			{
				if (!isSupported(entry, targetMins))
				{
					const unsupported = getUnsupportedBrowsers(entry, targetMins);
					const owners = instanceMethodOwners[methodName];
					const ownerLabel = owners.length <= 2
						? owners.map((o) => `${o}.prototype.${methodName}`).join(' / ')
						: `${owners[0]}.prototype.${methodName}`;

					warnings.push({
						message: `.${methodName}() may not be supported by targets (${ownerLabel}): ${unsupported.join(', ')}`,
						severity: 'warning',
						...calculateRisk(entry, targetMins),
						line: lineIndex + 1,
						column: match.index + 1,
					});
				}
			}
		}
	}
}

export function checkCss(
	code: string,
	bcd: BcdData,
	targetMins: BrowserVersions,
	warnings: BaselineWarning[],
): void
{
	const lines = code.split('\n');
	let supportsDepth = 0;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++)
	{
		const line = lines[lineIndex];
		const trimmed = line.trim();

		if (trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//'))
		{
			continue;
		}

		if (line.includes('@chef-ignore') || lines[lineIndex - 1]?.includes('@chef-ignore'))
		{
			continue;
		}

		// Track @supports nesting — content inside is progressive enhancement
		if (/^@supports\b/.test(trimmed))
		{
			const opens = (line.match(/\{/g) || []).length;
			supportsDepth += Math.max(opens, 1);
			continue;
		}

		if (supportsDepth > 0)
		{
			const opens = (line.match(/\{/g) || []).length;
			const closes = (line.match(/\}/g) || []).length;
			supportsDepth += opens - closes;

			continue;
		}

		const atRuleMatch = trimmed.match(/^@(\w[\w-]*)/);
		if (atRuleMatch)
		{
			const ruleName = atRuleMatch[1];
			const entry = bcd.css['at-rules'][ruleName];
			if (entry?.__compat && !isSupported(entry, targetMins, true))
			{
				const unsupported = getUnsupportedBrowsers(entry, targetMins, true);
				warnings.push({
					message: `CSS @${ruleName} is not supported by targets: ${unsupported.join(', ')}`,
					severity: 'warning',
					...calculateRisk(entry, targetMins, true),
					line: lineIndex + 1,
					column: line.indexOf('@'),
				});
			}
		}

		const propertyMatch = trimmed.match(/^([\w-]+)\s*:/);
		if (propertyMatch)
		{
			const propertyName = propertyMatch[1];
			if (!propertyName.startsWith('-'))
			{
				const entry = bcd.css.properties[propertyName];
				if (entry?.__compat && !isSupported(entry, targetMins, true))
				{
					const unsupported = getUnsupportedBrowsers(entry, targetMins, true);
					warnings.push({
						message: `CSS property "${propertyName}" is not supported by targets: ${unsupported.join(', ')}`,
						severity: 'warning',
						...calculateRisk(entry, targetMins, true),
						line: lineIndex + 1,
						column: line.indexOf(propertyName),
					});
				}
			}
		}

		const selectorMatches = trimmed.matchAll(/(:{1,2})([\w-]+)/g);
		for (const selectorMatch of selectorMatches)
		{
			if (propertyMatch)
			{
				break;
			}

			const fullSelector = selectorMatch[0];
			if (fullSelector.includes('-webkit-') || fullSelector.includes('-moz-') || fullSelector.includes('-ms-') || fullSelector.includes('-o-'))
			{
				continue;
			}

			const selectorName = selectorMatch[2];
			const entry = bcd.css.selectors[selectorName];
			if (entry?.__compat && !isSupported(entry, targetMins, true))
			{
				const unsupported = getUnsupportedBrowsers(entry, targetMins, true);
				const prefix = selectorMatch[1];
				warnings.push({
					message: `CSS selector "${prefix}${selectorName}" is not supported by targets: ${unsupported.join(', ')}`,
					severity: 'warning',
					...calculateRisk(entry, targetMins, true),
					line: lineIndex + 1,
					column: line.indexOf(selectorMatch[0]),
				});
			}
		}
	}
}
