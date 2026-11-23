import path from 'node:path';

import browserslist from 'browserslist';

import { ChefConfigManager } from '../config/project/chef-config-manager';
import { parseDenyOption } from '../config/project/chef-config';
import { Environment } from '../../environment/environment';

const DEFAULT_TARGETS = 'baseline widely available';

export interface ResolveTargetsOptions
{
	packagePath: string;
	bundleTargets?: string | string[];
}

export interface ResolvedTargets
{
	targets: string[];
	/**
	 * Own targets of the extension that were ignored because `deny.targets`
	 * is enabled in chef.config. Empty when the rule is disabled.
	 */
	deniedOverrides: string[];
}

/**
 * Resolves browser targets of an extension.
 *
 * Priority: `enforce.targets` → own targets of the extension (bundle.config,
 * browserslist config up the tree, BROWSERSLIST env) → `defaults.targets` →
 * `baseline widely available`.
 *
 * With `deny.targets` own targets are skipped: only the browserslist config of
 * the project root is taken into account.
 */
export function resolveTargets(options: ResolveTargetsOptions): ResolvedTargets
{
	const config = ChefConfigManager.getInstance().getConfig();
	const denied = parseDenyOption(config.deny?.targets).enabled;
	const deniedOverrides = denied ? findOwnTargets(options) : [];

	const query = config.enforce?.targets
		?? (denied ? loadProjectTargets() : loadOwnTargets(options))
		?? config.defaults?.targets
		?? DEFAULT_TARGETS;

	return {
		targets: browserslist(query),
		deniedOverrides,
	};
}

function loadOwnTargets(options: ResolveTargetsOptions): string | string[] | undefined
{
	if (hasQuery(options.bundleTargets))
	{
		return options.bundleTargets;
	}

	const fileTargets = browserslist.loadConfig({ path: options.packagePath });

	return hasQuery(fileTargets) ? fileTargets : undefined;
}

function loadProjectTargets(): string[] | undefined
{
	const root = Environment.getRoot();
	if (!root)
	{
		return undefined;
	}

	// Read the file directly: `loadConfig` would prefer the BROWSERSLIST env variable.
	const sections = browserslist.findConfig(root);
	const environment = process.env.BROWSERSLIST_ENV ?? process.env.NODE_ENV ?? 'production';
	const targets = sections?.[environment] ?? sections?.defaults;

	return hasQuery(targets) ? targets : undefined;
}

function findOwnTargets(options: ResolveTargetsOptions): string[]
{
	const overrides: string[] = [];

	if (hasQuery(options.bundleTargets))
	{
		overrides.push('targets in bundle.config');
	}

	const configFile = browserslist.findConfigFile(options.packagePath);
	if (configFile && isInsideProject(path.dirname(configFile)))
	{
		overrides.push(path.relative(Environment.getRoot() ?? options.packagePath, configFile));
	}

	for (const variable of ['BROWSERSLIST', 'BROWSERSLIST_CONFIG'])
	{
		if (process.env[variable])
		{
			overrides.push(`${variable} environment variable`);
		}
	}

	return overrides;
}

/**
 * A browserslist config below the project root belongs to an extension,
 * the one in the root (or above it) belongs to the project.
 */
function isInsideProject(directory: string): boolean
{
	const root = Environment.getRoot();
	if (!root)
	{
		return true;
	}

	const relative = path.relative(root, directory);

	return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function hasQuery(value: unknown): value is string | string[]
{
	return (typeof value === 'string' && value.length > 0)
		|| (Array.isArray(value) && value.length > 0);
}
