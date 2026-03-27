import fs from 'node:fs/promises';

import { denyLabels, parseDenyOption } from './chef-config';
import { CF } from '../../../diagnostics/diagnostic-codes';

import type { ChefConfig, DenySeverity } from './chef-config';
import type { BuildOptions } from '../../engines/build/build-types';

export interface ValidationIssue
{
	code?: string;
	option: string;
	severity: DenySeverity;
	message: string;
}

const denyChecks: Array<{ key: string; check: (options: BuildOptions) => boolean | Promise<boolean> }> = [
	{ key: 'sfc', check: (o) => !!o.vue },
	{ key: 'minification', check: (o) => !!o.minify },
	{ key: 'standalone', check: (o) => !!o.standalone },
	{ key: 'resolveNodeModules', check: (o) => !!o.resolve },
	{ key: 'transformClasses', check: (o) => !!o.transformClasses },
	{ key: 'sourceMaps', check: (o) => !!o.sourceMaps },
	{ key: 'exportDefault', check: (o) => hasExportDefault(o.input) },
];

export async function validateBuildOptions(options: BuildOptions, config: ChefConfig): Promise<ValidationIssue[]>
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
		if (rule.enabled && await check(options))
		{
			issues.push({
				code: CF.OPTION_DENIED,
				option: key,
				severity: rule.severity,
				message: rule.message ?? `${denyLabels[key]} denied by project config (chef.config)`,
			});
		}
	}

	return issues;
}

async function hasExportDefault(inputPath: string): Promise<boolean>
{
	try
	{
		const content = await fs.readFile(inputPath, 'utf-8');

		return /(?:^|\n)\s*export\s+default\s/m.test(content);
	}
	catch
	{
		return false;
	}
}
