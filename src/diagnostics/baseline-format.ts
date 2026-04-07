import chalk from 'chalk';

import { CF } from './diagnostic-codes';

export const riskColors: Record<string, (text: string) => string> = {
	high: chalk.red,
	medium: chalk.yellow,
	low: chalk.green,
};

export function cleanBaselineMessage(message: string): string
{
	return message
		.replace(/^\[plugin [^\]]+\]\s*/, '')
		.replace(/^.+?\(\d+:\d+\):\s*/, '');
}

export function extractBrowsersStr(message: string): string | undefined
{
	return cleanBaselineMessage(message).match(/targets(?:\s*\([^)]*\))?:\s*(.+)$/)?.[1];
}

export function extractFeatureName(message: string): string | null
{
	const cleaned = cleanBaselineMessage(message);
	const match = cleaned.match(/^(.+?)(?:\s+is not supported|\s+may not be supported)/);
	if (!match)
	{
		return null;
	}

	// "CSS property "scrollbar-width"" → "scrollbar-width"
	// "CSS @layer" → "@layer"
	// "CSS selector ":has"" → ":has"
	// ".at()" stays as ".at()"
	// "Promise.withResolvers()" stays as "Promise.withResolvers()"
	return match[1]
		.replace(/^CSS (?:property|selector)\s+"([^"]+)"/, '$1')
		.replace(/^CSS @/, '@');
}

export function extractFeatureLabel(message: string): string
{
	const cleaned = cleanBaselineMessage(message);
	const label = cleaned.replace(/\s*(?:is not supported|may not be supported) by targets.*$/, '');

	if (!label.startsWith('CSS '))
	{
		return `JS ${label}`;
	}

	return label;
}

export function formatRiskLine(risk: string): string
{
	return `${chalk.dim('Risk:')} ${riskColors[risk](risk)}`;
}

export function formatCodeLabel(code: string, severity: 'error' | 'warning'): string
{
	return severity === 'error'
		? chalk.red(`[${code}]`)
		: chalk.yellow(`[${code}]`);
}

export function formatBrowserLines(browsersStr: string, indent: string): string[]
{
	const lines: string[] = [];
	const browsers = browsersStr.split(/,\s*/);
	for (const browser of browsers)
	{
		const availMatch = browser.match(/^(.+?)\s+(\S+)\s+\(available from (\S+)\)$/);
		const noSupportMatch = browser.match(/^(.+?)\s+(\S+)$/);
		if (availMatch)
		{
			const [, name, target, from] = availMatch;
			lines.push(`${indent}${chalk.dim(name.padEnd(8))} ${chalk.dim(target)} ${chalk.dim('→')} ${chalk.white(from)}`);
		}
		else if (noSupportMatch)
		{
			const [, name] = noSupportMatch;
			lines.push(`${indent}${chalk.dim(name.padEnd(8))} ${chalk.red('not supported')}`);
		}
	}

	return lines;
}

export function formatCaniuseLink(featureName: string): string
{
	const query = encodeURIComponent(featureName.replace(/[()]/g, ''));

	return `https://caniuse.com/?search=${query}`;
}

export function baselineSeverity(code: string): 'error' | 'warning'
{
	return code === CF.BASELINE_JS_UNSUPPORTED ? 'error' : 'warning';
}

export function isBaselineCode(code?: string): boolean
{
	return code === CF.BASELINE_JS_UNSUPPORTED
		|| code === CF.BASELINE_CSS_UNSUPPORTED
		|| code === CF.BASELINE_JS_MAYBE_UNSUPPORTED;
}
