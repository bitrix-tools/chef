import type { BrowserVersions, CompatEntry, RiskInfo, SupportRecord } from './types';

const browserLabels: Record<string, string> = {
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

function isBrowserSupported(records: SupportRecord | SupportRecord[], minVersion: number, withPrefixes: boolean): boolean
{
	const list = Array.isArray(records) ? records : [records];
	const standard = list.find((r) => !r.prefix);

	if (standard)
	{
		if (standard.version_added === false)
		{
			// Not supported natively — fall through to prefixed fallback check.
		}
		else if (typeof standard.version_added === 'string' && parseFloat(standard.version_added) > minVersion)
		{
			// Not yet supported natively — fall through to prefixed fallback check.
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

export function isSupported(entry: CompatEntry | undefined, targetMins: BrowserVersions, withPrefixes = false): boolean
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

export function getUnsupportedBrowsers(entry: CompatEntry | undefined, targetMins: BrowserVersions, withPrefixes = false): string[]
{
	if (!entry?.__compat?.support)
	{
		return [];
	}

	const support = entry.__compat.support;
	const unsupported: string[] = [];

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
			unsupported.push(`${browserLabels[browser]} ${minVersion}`);
		}
		else if (typeof added === 'string' && parseFloat(added) > minVersion)
		{
			unsupported.push(`${browserLabels[browser]} ${minVersion} (available from ${added})`);
		}
		else
		{
			unsupported.push(`${browserLabels[browser]} ${minVersion}`);
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
			unsupportedBrowsers.push(browserLabels[browser] ?? browser);
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
				maxGapBrowser = browserLabels[browser] ?? browser;
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
