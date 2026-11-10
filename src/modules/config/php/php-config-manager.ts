import * as path from 'node:path';
import * as fs from 'node:fs';

import { ConfigManager } from '../config-manager';
import * as bundleConfigStrategies from './strategies/index'
import { ConfigStrategy } from '../config-strategy';
import { PhpConfigParser } from './parser/php-config-parser';

export function renderRel(rel: Array<string>): string
{
	return `${rel.map((item, i) => `${!i ? '\n' : ''}\t\t'${item}'`).join(',\n')}${rel.length ? ',\n\t' : ''}`;
}

export class PhpConfigManager extends ConfigManager<{ [key: string]: any }>
{
	constructor()
	{
		super();

		Object.values(bundleConfigStrategies).forEach((strategy: ConfigStrategy) => {
			this.registerStrategy(strategy.key, strategy);
		});
	}

	loadFromFile(configPath: string): any
	{
		const parser = new PhpConfigParser();
		const contents = fs.readFileSync(path.resolve(configPath), 'utf-8');
		const result = parser.parse(contents);

		Object.entries(result).forEach(([key, value]) => {
			this.set(key, value);
		});
	}

	async save(configPath: string, extensionName?: string): Promise<any>
	{
		if (!fs.existsSync(configPath))
		{
			fs.writeFileSync(configPath, '');
		}

		const dependencies = this.get('rel');
		const includes = this.get('includes') ?? [];

		const isMainCore = extensionName === 'main.core';
		const dependsOnMainCore = dependencies.includes('main.core') || includes.includes('main.core');

		// Add main.polyfill.core if not main.core and doesn't depend on main.core
		if (
			!isMainCore
			&& !dependsOnMainCore
			&& !dependencies.includes('main.polyfill.core')
			&& !includes.includes('main.polyfill.core')
		)
		{
			dependencies.unshift('main.polyfill.core');
		}

		// Updates dependencies list
		const relExp = /['"]rel['"] => (\[.*?\])(,?)/s;
		let configContent = fs.readFileSync(configPath, 'utf-8');
		const result = configContent.match(relExp);

		if (Array.isArray(result) && result[1])
		{
			const rel = `[${renderRel(dependencies)}]`;
			configContent = configContent.replace(result[1], rel);

			// Adjust skip_core: true only if not main.core and doesn't depend on main.core
			const skipCoreExp = /['"]skip_core['"] => (true|false)(,?)/;
			const skipCoreResult = configContent.match(skipCoreExp);
			const skipCoreValue = !isMainCore && !dependsOnMainCore;

			if (Array.isArray(skipCoreResult) && skipCoreResult[1])
			{
				configContent = configContent
					.replace(skipCoreExp, `'skip_core' => ${skipCoreValue},`);
			}
			else if (!isMainCore)
			{
				// Only add skip_core for non-main.core extensions
				configContent = configContent.replace(
					relExp,
					`'rel' => ${rel},\n\t'skip_core' => ${skipCoreValue},`,
				);
			}

			const namespace = this.get('namespace');
			if (typeof namespace === 'string')
			{
				configContent = applyNamespace(configContent, namespace);
			}

			fs.writeFileSync(configPath, configContent);
		}
	}
}

/**
 * Writes the top-level `namespace` entry next to `rel`: replaces the value of an existing entry
 * or adds the entry right before `rel` with the same indentation. Entries of nested arrays
 * (`settings` and others) are told apart by their deeper indentation and stay as they are.
 */
export function applyNamespace(configContent: string, namespace: string): string
{
	const relLine = configContent.match(/^([ \t]*)['"]rel['"] =>/m);
	if (!relLine)
	{
		return configContent;
	}

	const indent = relLine[1];
	const entry = `${indent}'namespace' => '${escapePhpString(namespace)}',`;
	const entryExp = new RegExp(
		`^${indent}['"]namespace['"]\\s*=>\\s*(?:'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"),?[ \\t]*$`,
		'm',
	);

	if (entryExp.test(configContent))
	{
		return configContent.replace(entryExp, () => entry);
	}

	const relIndex = relLine.index ?? 0;

	return `${configContent.slice(0, relIndex)}${entry}\n${configContent.slice(relIndex)}`;
}

function escapePhpString(value: string): string
{
	return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}
