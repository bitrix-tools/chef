import { calculateRisk, getUnsupportedBrowsers, isSupported } from './support';
import { loadBcd } from './bcd-index';

import type { BaselineWarning, BcdData, BrowserVersions } from './types';

/**
 * Line-based CSS scanner. Catches at-rules, declarations and selectors that
 * fall outside the project targets. `@supports` blocks are treated as
 * progressive enhancement and are skipped.
 *
 * The legacy regex-driven implementation is preserved here verbatim — CSS
 * is simple enough that line-by-line scanning works well and avoids pulling
 * in a CSS AST dependency.
 */
export function checkCss(code: string, targetMins: BrowserVersions, warnings: BaselineWarning[], bcd: BcdData = loadBcd()): void
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
