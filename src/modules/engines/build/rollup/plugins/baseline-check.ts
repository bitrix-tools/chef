import type { Plugin } from 'rollup';

import { checkCode, resolveTargetMins } from '../../../../baseline/checker';

import type { BaselineWarning } from '../../../../baseline/types';

interface BaselineCheckOptions
{
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

	return {
		name: 'baseline-check',

		transform(code, id)
		{
			const warnings: BaselineWarning[] = checkCode({ code, id, targets: targetMins });

			for (const warning of warnings)
			{
				this.warn({
					message: warning.message,
					loc: { line: warning.line, column: warning.column, file: id },
					meta: {
						severity: warning.severity,
						risk: warning.risk,
						unsupportedIn: warning.unsupportedIn,
						gapInfo: warning.gapInfo,
					},
				});
			}

			return null;
		},
	};
}
