import type { Plugin } from 'rollup';

import {
	resolveTargetMins,
	loadBcd,
	buildInstanceMethodMap,
	checkJavaScript,
	checkCss,
} from './baseline-checker';

import type { BaselineWarning } from './baseline-checker';

interface BaselineCheckOptions {
	targets: string[];
	packageRoot: string;
}

export default function baselineCheckPlugin(options: BaselineCheckOptions): Plugin
{
	const targetMins = resolveTargetMins(options.targets);

	if (Object.keys(targetMins).length === 0)
	{
		return { name: 'baseline-check' };
	}

	const bcd = loadBcd();
	const instanceMethodMap = buildInstanceMethodMap(bcd);

	return {
		name: 'baseline-check',

		transform(code, id)
		{
			const warnings: BaselineWarning[] = [];

			if (id.endsWith('.css'))
			{
				checkCss(code, bcd, targetMins, warnings);
			}
			else if (!id.includes('node_modules'))
			{
				const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];
				if (extensions.some((ext) => id.endsWith(ext)))
				{
					checkJavaScript(code, bcd, targetMins, instanceMethodMap, warnings);
				}
			}

			for (const warning of warnings)
			{
				this.warn({
					message: warning.message,
					loc: { line: warning.line, column: warning.column, file: id },
					meta: { severity: warning.severity, risk: warning.risk, unsupportedIn: warning.unsupportedIn, gapInfo: warning.gapInfo },
				});
			}

			return null;
		},
	};
}
