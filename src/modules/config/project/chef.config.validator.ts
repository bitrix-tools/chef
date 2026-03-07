import type { ChefConfig, DenySeverity } from './chef.config';
import { denyLabels, parseDenyOption } from './chef.config';
import type { BuildOptions } from '../../services/build/types/build.service.types';

export interface ValidationIssue
{
	option: string;
	severity: DenySeverity;
	message: string;
}

const denyChecks: Array<{ key: string; check: (options: BuildOptions) => boolean }> = [
	{ key: 'sfc', check: (o) => !!o.vue },
	{ key: 'minification', check: (o) => !!o.minify },
	{ key: 'standalone', check: (o) => !!o.standalone },
	{ key: 'resolveNodeModules', check: (o) => !!o.resolve },
	{ key: 'transformClasses', check: (o) => !!o.transformClasses },
	{ key: 'sourceMaps', check: (o) => !!o.sourceMaps },
];

export function validateBuildOptions(options: BuildOptions, config: ChefConfig): ValidationIssue[]
{
	const issues: ValidationIssue[] = [];
	const deny = config.deny;

	if (!deny)
	{
		return issues;
	}

	for (const { key, check } of denyChecks)
	{
		const rule = parseDenyOption(deny[key as keyof typeof deny]);
		if (rule.enabled && check(options))
		{
			issues.push({
				option: key,
				severity: rule.severity,
				message: rule.message ?? `${denyLabels[key]} denied by project config (chef.config)`,
			});
		}
	}

	return issues;
}
