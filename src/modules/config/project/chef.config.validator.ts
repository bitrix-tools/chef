import type { ChefConfig } from './chef.config';
import { denyLabels } from './chef.config';
import type { BuildOptions } from '../../services/build/types/build.service.types';

export interface ValidationError
{
	option: string;
	message: string;
}

export function validateBuildOptions(options: BuildOptions, config: ChefConfig): ValidationError[]
{
	const errors: ValidationError[] = [];
	const deny = config.deny;

	if (!deny)
	{
		return errors;
	}

	if (deny.sfc && options.vue)
	{
		errors.push({
			option: 'sfc',
			message: `${denyLabels.sfc} denied by project config (chef.config)`,
		});
	}

	if (deny.minification && options.minify)
	{
		errors.push({
			option: 'minification',
			message: `${denyLabels.minification} denied by project config (chef.config)`,
		});
	}

	if (deny.standalone && options.standalone)
	{
		errors.push({
			option: 'standalone',
			message: `${denyLabels.standalone} denied by project config (chef.config)`,
		});
	}

	if (deny.resolveNodeModules && options.resolve)
	{
		errors.push({
			option: 'resolveNodeModules',
			message: `${denyLabels.resolveNodeModules} denied by project config (chef.config)`,
		});
	}

	if (deny.transformClasses && options.transformClasses)
	{
		errors.push({
			option: 'transformClasses',
			message: `${denyLabels.transformClasses} denied by project config (chef.config)`,
		});
	}

	if (deny.sourceMaps && options.sourceMaps)
	{
		errors.push({
			option: 'sourceMaps',
			message: `${denyLabels.sourceMaps} denied by project config (chef.config)`,
		});
	}

	return errors;
}
