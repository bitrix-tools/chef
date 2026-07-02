import path from 'node:path';
import fs from 'node:fs';

import MagicString from 'magic-string';

import {
	rollup,
	type InputOptions,
	type OutputOptions,
	type RollupLog,
	type Plugin,
	type RollupBuild,
	type RollupOutput,
	type WarningHandlerWithDefault,
	type OutputChunk,
	type TreeshakingOptions,
	type TreeshakingPreset,
} from 'rollup';

import { Environment } from '../../../../environment/environment';
import { PackageResolver, findExtensionPath } from '../../../packages/package-resolver';
import { PhpConfigManager } from '../../../config/php/php-config-manager';
import { isExternalDependencyName } from '../../../../utils/is-external-dependency-name';
import { BuildStrategy } from '../build-strategy';
import { CF } from '../../../../diagnostics/diagnostic-codes';
import { FileFinder } from '../../../../utils/file-finder';
import { loadTsConfig } from '../../../../utils/load-tsconfig';
import { normalizePath } from '../../../../utils/path/normalize';
import concatPlugin from './plugins/concat';
import stripCommentsPlugin from './plugins/strip-comments';
import safeNamespacesPlugin from './plugins/safe-namespaces';
import tabIndentPlugin from './plugins/tab-indent';

import type { ParsedCommandLine } from 'typescript';
import type {
	BuildDiagnostic,
	BuildResult,
	BuildOptions,
	BundleFileInfo,
	BuildCodeOptions,
	BuildCodeResult,
} from '../build-types';
import type { RemapTarget } from '../../../config/bundle/strategies/standalone-strategy';

export class RollupBuildStrategy extends BuildStrategy
{
	#buildCodeCache: RollupBuild['cache'] = undefined;

	protected static calculateBundlesSize(output: RollupOutput['output']): BundleFileInfo[]
	{
		return output.map((chunk) => {
			const code = chunk.type === 'asset' ? chunk.source : chunk.code;
			const size = Buffer.byteLength(code, 'utf8');

			return {
				fileName: chunk.fileName,
				size,
			};
		});
	}

	static #removeEmptyChunks(output: RollupOutput['output'], jsOutputPath: string): void
	{
		for (let i = output.length - 1; i >= 0; i--)
		{
			const chunk = output[i];
			if (chunk.type !== 'chunk')
			{
				continue;
			}

			const code = chunk.code
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/\/\/# sourceMappingURL=.*/g, '')
				.replace(/['"]use strict['"];?/g, '')
				.replace(/\(function\s*\([^)]*\)\s*\{/g, '')
				.replace(/\}\)\([^)]*\);?/g, '')
				.replace(/\s/g, '');

			if (code.length > 0)
			{
				continue;
			}

			output.splice(i, 1);

			// Remove written files
			const jsFile = path.resolve(path.dirname(jsOutputPath), chunk.fileName);
			fs.rmSync(jsFile, { force: true });
			fs.rmSync(`${jsFile}.map`, { force: true });

			// Remove sourcemap asset from output
			const mapFileName = `${chunk.fileName}.map`;
			const mapIndex = output.findIndex(o => o.fileName === mapFileName);
			if (mapIndex !== -1)
			{
				output.splice(mapIndex, 1);
			}
		}
	}

	protected static makeGlobals(dependencies: string[]): Record<string, string>
	{
		return dependencies.reduce((acc, dependency: string) => {
			const extension = PackageResolver.resolve(dependency);
			if (extension)
			{
				return { ...acc, ...extension.getGlobal() };
			}

			return { ...acc, [dependency]: RollupBuildStrategy.guessNamespace(dependency) };
		}, {})
	}

	protected static guessNamespace(dependency: string): string
	{
		const root = Environment.getRoot();
		if (!root)
		{
			return 'window';
		}

		if (Environment.getType() === 'source')
		{
			return 'BX';
		}

		const segments = dependency.split('.');
		const bitrixPath = path.join(root, 'bitrix', 'js', ...segments);
		if (fs.existsSync(bitrixPath))
		{
			return 'BX';
		}

		return 'window';
	}

	static readonly #npmToBitrixMap: Record<string, string> = {
		'vue': 'ui.vue3',
	};

	protected static createEnvReplacePlugin(production: boolean): Plugin
	{
		const replacements: Record<string, string> = {
			'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
			'import.meta.env.MODE': JSON.stringify(production ? 'production' : 'development'),
			'import.meta.env.PROD': String(production),
			'import.meta.env.DEV': String(!production),
		};

		const keys = Object.keys(replacements);

		return {
			name: 'env-replace',
			transform(code)
			{
				const matched = keys.filter((key) => code.includes(key));
				if (matched.length === 0)
				{
					return null;
				}

				// Replace env expressions through magic-string so the shorter/longer
				// replacements keep the source map aligned (map: null would drop it).
				const magic = new MagicString(code);
				for (const key of matched)
				{
					let index = code.indexOf(key);
					while (index !== -1)
					{
						magic.overwrite(index, index + key.length, replacements[key]);
						index = code.indexOf(key, index + key.length);
					}
				}

				return {
					code: magic.toString(),
					map: magic.generateMap({ hires: true }),
				};
			},
		};
	}

	protected static createNpmRemapPlugin(dependenciesRef?: string[]): Plugin
	{
		return {
			name: 'npm-to-bitrix-remap',
			resolveId(id)
			{
				if (id in RollupBuildStrategy.#npmToBitrixMap)
				{
					const mapped = RollupBuildStrategy.#npmToBitrixMap[id];
					dependenciesRef?.push(mapped);

					return { id: mapped, external: true };
				}

				return null;
			},
		};
	}

	protected static toDiagnostic(error: unknown, code: string = CF.SYNTAX_ERROR): BuildDiagnostic
	{
		const rollupCode = (error instanceof Error && 'code' in error && typeof error.code === 'string')
			? error.code
			: undefined;

		const errorCode = rollupCode?.startsWith('CF')
			? rollupCode
			: (rollupCode && RollupBuildStrategy.#rollupWarningCodes[rollupCode]) ?? code;

		if (error instanceof Error && 'loc' in error)
		{
			const loc = (error as any).loc;

			return {
				code: errorCode,
				message: error.message,
				frame: (error as any).frame,
				loc: loc?.file ? { file: loc.file, line: loc.line, column: loc.column } : undefined,
			};
		}

		return {
			code: errorCode,
			message: error instanceof Error ? error.message : String(error),
		};
	}

	static readonly #rollupWarningCodes: Record<string, string> = {
		CIRCULAR_DEPENDENCY: CF.CIRCULAR_DEPENDENCY,
		MISSING_EXPORT: CF.MISSING_EXPORT,
		THIS_IS_UNDEFINED: CF.THIS_IS_UNDEFINED,
		EVAL: CF.EVAL,
		MISSING_GLOBAL_NAME: CF.MISSING_GLOBAL_NAME,
		UNUSED_EXTERNAL_IMPORT: CF.UNUSED_EXTERNAL_IMPORT,
		UNRESOLVED_IMPORT: CF.UNRESOLVED_IMPORT,
		MISSING_NAME_OPTION_FOR_IIFE_EXPORT: CF.MISSING_IIFE_NAME,
		PLUGIN_WARNING: CF.PLUGIN_WARNING,
	};

	/**
	 * Resolve a Rollup CIRCULAR_DEPENDENCY warning (which carries `ids: string[]` — the full chain
	 * of resolved absolute paths) into a BuildDiagnostic with a code frame pointing at the
	 * `import` line in the first file of the chain. Only called for direct cycles (already
	 * filtered in onWarning).
	 */
	static async #resolveCircularWarning(ids: string[]): Promise<BuildDiagnostic>
	{
		const { findRelativeImportLocation } = await import('../../../../utils/ast/find-import-location');

		const relIds = ids.map((id) => RollupBuildStrategy.#shortenIdForMessage(id));
		const message = `Circular import: ${relIds.join(' → ')}`;

		const details = [
			'Modules in this cycle reference each other at load time, so one of them sees the',
			'other as `undefined` until both have finished evaluating. Code that uses such an',
			'import at module top level (vs. inside a function called later) may crash or',
			'silently get the wrong value.',
			'',
			'To break the cycle:',
			'  • extract the shared symbols into a third module that both can import, or',
			'  • move top-level usage inside a function so the binding is read lazily, or',
			'  • invert one direction so the dependency only flows one way.',
		].join('\n');

		const location = ids.length >= 2
			? await findRelativeImportLocation(ids[0], ids[1])
			: null;

		return {
			code: CF.CIRCULAR_DEPENDENCY,
			message,
			details,
			loc: location ?? undefined,
		};
	}

	static #shortenIdForMessage(id: string): string
	{
		const cwd = process.cwd();
		if (id.startsWith(cwd))
		{
			return path.relative(cwd, id) || id;
		}

		return id;
	}

	static #findImportedNames(filePath: string, exporter: string, unusedNames: Set<string>): string[]
	{
		try
		{
			const content = fs.readFileSync(filePath, 'utf-8');
			const importPattern = new RegExp(
				`import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${exporter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
			);
			const match = content.match(importPattern);
			if (!match)
			{
				return [];
			}

			const imported = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);

			return imported.filter(name => unusedNames.has(name));
		}
		catch
		{
			return [];
		}
	}

	static #findImportLine(filePath: string, exporter: string): { line: number; column: number } | null
	{
		try
		{
			const content = fs.readFileSync(filePath, 'utf-8');
			const lines = content.split('\n');
			const escaped = exporter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const pattern = new RegExp(`import\\s*\\{[^}]+\\}\\s*from\\s*['"]${escaped}['"]`);

			for (let i = 0; i < lines.length; i++)
			{
				if (pattern.test(lines[i]))
				{
					return { line: i + 1, column: 0 };
				}
			}
		}
		catch
		{
			// File read error — skip
		}

		return null;
	}

	protected static createOnWarningHandler(): {
		warningsRef: BuildDiagnostic[],
		errorsRef: BuildDiagnostic[],
		dependenciesRef: string[],
		pendingCircularRef: string[][],
		onWarning: WarningHandlerWithDefault,
	}
	{
		const warningsRef: Array<BuildDiagnostic> = [];
		const errorsRef: Array<BuildDiagnostic> = [];
		const dependenciesRef: Array<string> = [];
		const pendingCircularRef: string[][] = [];
		const onWarning = (warning: RollupLog): void => {
			if (warning.code === 'EMPTY_BUNDLE')
			{
				return;
			}

			if (
				warning.code === 'UNRESOLVED_IMPORT'
				&& isExternalDependencyName(warning.exporter)
			)
			{
				dependenciesRef.push(warning.exporter);

				return;
			}

			if (warning.plugin === 'baseline-check')
			{
				const meta = (warning as any).meta ?? {};
				const severity = meta.severity ?? 'error';
				const risk = meta.risk;
				const unsupportedIn = meta.unsupportedIn;
				const gapInfo = meta.gapInfo;
				const isCss = /CSS (?:property|@|selector)/.test(warning.message);

				let code: string;
				if (isCss)
				{
					code = CF.BASELINE_CSS_UNSUPPORTED;
				}
				else if (severity === 'warning')
				{
					code = CF.BASELINE_JS_MAYBE_UNSUPPORTED;
				}
				else
				{
					code = CF.BASELINE_JS_UNSUPPORTED;
				}

				const entry = {
					code,
					message: warning.message,
					frame: warning.frame,
					loc: warning.loc?.file
						? {
							file: warning.loc.file,
							line: warning.loc.line,
							column: warning.loc.column + 1,
						}
						: undefined,
					risk,
					unsupportedIn,
					gapInfo,
				};

				if (severity === 'error')
				{
					errorsRef.push(entry);
				}
				else
				{
					warningsRef.push(entry);
				}

				return;
			}

			if (warning.code === 'CIRCULAR_DEPENDENCY')
			{
				const ids = (warning as { ids?: string[] }).ids ?? [];
				// Keep only direct cycles: A → A (length 2) and A → B → A (length 3).
				// Longer chains (A → B → C → A) point to tight coupling but rarely break at runtime;
				// surfacing them on every build adds noise. `chef diag circular-imports` covers them.
				if (ids.length > 0 && ids.length <= 3)
				{
					pendingCircularRef.push(ids);
				}

				return;
			}

			if (warning.code === 'UNUSED_EXTERNAL_IMPORT')
			{
				const names = new Set((warning as any).names as string[] ?? []);
				const importers = (warning as any).ids as string[] | undefined;
				const exporter = warning.exporter ?? '';

				if (names.size > 0 && importers && importers.length > 0)
				{
					for (const importer of importers)
					{
						const importerPosix = normalizePath(importer);
						const relative = importerPosix.includes('/src/')
							? importerPosix.slice(importerPosix.indexOf('/src/') + 1)
							: path.basename(importer);

						// Read the file to find exact unused imports and import line
						const perFileNames = RollupBuildStrategy.#findImportedNames(importer, exporter, names);
						if (perFileNames.length === 0)
						{
							continue;
						}

						const nameList = perFileNames.map(n => `"${n}"`).join(', ');
						const importLine = RollupBuildStrategy.#findImportLine(importer, exporter);

						warningsRef.push({
							code: CF.UNUSED_EXTERNAL_IMPORT,
							message: `${nameList} imported from "${exporter}" but never used`,
							loc: importLine
								? { file: importer, line: importLine.line, column: importLine.column }
								: undefined,
						});
					}
				}
				else
				{
					warningsRef.push({
						code: CF.UNUSED_EXTERNAL_IMPORT,
						message: warning.message,
					});
				}

				return;
			}

			const code = (warning.code && RollupBuildStrategy.#rollupWarningCodes[warning.code]) ?? CF.UNKNOWN_BUILD_WARNING;

			warningsRef.push({
				code,
				message: warning.message,
				frame: warning.frame,
				loc: warning.loc?.file
					? {
						file: warning.loc.file,
						line: warning.loc.line,
						column: warning.loc.column,
					}
					: undefined,
			});
		};

		return {
			warningsRef,
			errorsRef,
			dependenciesRef,
			pendingCircularRef,
			onWarning,
		};
	}

	protected static createVirtualEntryPlugin(entries: Record<string, string>): Plugin
	{
		return {
			name: 'virtual-module-plugin',
			resolveId(id) {
				if (id in entries)
				{
					return id;
				}

				return null;
			},
			load(id) {
				if (id in entries)
				{
					return entries[id];
				}

				return null;
			},
		}
	}

	// Resolves imports of `currentPackageName` to its source input path so that
	// test bundles pick up fresh source instead of the already-loaded BX.* globals.
	// All other extension imports fall through and are treated as external via
	// Rollup's UNRESOLVED_IMPORT warning handler.
	protected static createCurrentPackageResolver(currentPackageName?: string): Plugin
	{
		return {
			name: 'current-package-resolver',
			resolveId(id)
			{
				if (!currentPackageName || id !== currentPackageName)
				{
					return null;
				}

				const extension = PackageResolver.resolve(currentPackageName);
				if (!extension)
				{
					return null;
				}

				return extension.getInputPath();
			},
		};
	}

	protected static createStandalonePlugin(options: {
		currentPackageName?: string;
		currentNamespace?: string;
		dependenciesRef?: string[];
		remap?: Record<string, RemapTarget>;
		exposeNamespaces?: boolean;
		entryCssDeps?: string[];
	}): Plugin
	{
		const { currentPackageName, dependenciesRef, remap = {} } = options;
		const proxyModules = new Map<string, string>();
		const cssVisited = new Set<string>();

		// Pre-populate visited set with current package to avoid processing it in dependency walk
		if (currentPackageName)
		{
			cssVisited.add(currentPackageName);
		}

		return {
			name: 'standalone-plugin',

			async resolveId(id, importer)
			{
				if (id === currentPackageName)
				{
					return null;
				}

				if (proxyModules.has(id))
				{
					return id;
				}

				const remapResult = RollupBuildStrategy.#resolveRemap(remap, id);

				if (remapResult.npm)
				{
					const fromExtension = PackageResolver.resolve(remapResult.from ?? id);
					const resolveFrom = fromExtension
						? path.join(fromExtension.getPath(), 'src', '_resolve.js')
						: importer;

					const npmResolved = await this.resolve(remapResult.npm, resolveFrom, { skipSelf: true });

					if (options.exposeNamespaces && npmResolved && !npmResolved.external)
					{
						const sourceExtension = PackageResolver.resolve(id);
						const namespace = sourceExtension?.getBundleConfig().get('namespace');
						if (namespace && namespace !== 'window' && namespace !== options.currentNamespace)
						{
							const proxyId = `\0expose-npm:${id}`;
							if (!proxyModules.has(proxyId))
							{
								proxyModules.set(proxyId, RollupBuildStrategy.#buildExposeProxy(npmResolved.id, namespace));
							}

							return proxyId;
						}
					}

					return npmResolved;
				}

				const extensionName = remapResult.extension ?? id;
				const extension = PackageResolver.resolve(extensionName);
				if (!extension)
				{
					// Extension not found by PackageResolver — check if it's CSS-only without bundle.config
					const cssPath = RollupBuildStrategy.#getExtensionCssPath(extensionName);
					if (cssPath)
					{
						return cssPath;
					}

					return null;
				}

				const inputPath = extension.getInputPath();

				// Collect CSS-only dependencies from this extension's rel
				const cssDeps = RollupBuildStrategy.#collectCssOnlyDependencies(extensionName, cssVisited);

				if (options.exposeNamespaces)
				{
					const namespace = extension.getBundleConfig().get('namespace');
					if (namespace && namespace !== 'window' && namespace !== options.currentNamespace)
					{
						const proxyId = `\0expose:${extensionName}`;
						if (!proxyModules.has(proxyId))
						{
							proxyModules.set(proxyId, RollupBuildStrategy.#buildExposeProxy(inputPath, namespace, cssDeps));
						}

						return proxyId;
					}
				}

				if (cssDeps.length > 0)
				{
					const proxyId = `\0css-inject:${extensionName}`;
					if (!proxyModules.has(proxyId))
					{
						proxyModules.set(proxyId, RollupBuildStrategy.#buildCssInjectProxy(inputPath, cssDeps));
					}

					return proxyId;
				}

				return inputPath;
			},

			load(id)
			{
				if (proxyModules.has(id))
				{
					return proxyModules.get(id)!;
				}

				if (/\.d\.[cm]?ts$/.test(id))
				{
					return { code: '', map: null };
				}

				return null;
			},

			renderChunk(code)
			{
				// Inlined dependencies may reassign `exports` (e.g. main.core does
				// `exports = window.BX`). This breaks Rollup's own `exports.X = X`
				// assignments at the end of the IIFE. Restore original exports reference.
				const lines = code.split('\n');

				let firstExportAssignment = -1;
				let indent = '';
				for (let i = lines.length - 1; i >= 0; i--)
				{
					const match = lines[i].match(/^(\s+)exports\./);
					if (match)
					{
						firstExportAssignment = i;
						indent = match[1];
					}
					else if (firstExportAssignment !== -1)
					{
						break;
					}
				}

				if (firstExportAssignment === -1)
				{
					return null;
				}

				// Insert `exports = __originalExports__;` before the first export assignment.
				// Done through magic-string so the inserted line shifts the map for everything
				// below it (returning map: null would leave stale positions).
				let insertAt = 0;
				for (let i = 0; i < firstExportAssignment; i++)
				{
					insertAt += lines[i].length + 1; // +1 for '\n'
				}

				const magic = new MagicString(code);
				magic.appendLeft(insertAt, `${indent}exports = __originalExports__;\n`);

				return {
					code: magic.toString(),
					map: magic.generateMap({ hires: true }),
				};
			},
		};
	}

	static #buildExposeProxy(inputPath: string, namespace: string, cssDeps: string[] = []): string
	{
		const normalizedPath = inputPath.replaceAll('\\', '/');
		const cssImports = cssDeps
			.map((cssPath) => `import '${cssPath.replaceAll('\\', '/')}';`)
			.join('\n');

		const parts = namespace.split('.');
		const nsInit = parts
			.map((_, i) =>
			{
				const ns = parts.slice(0, i + 1).join('.');
				return `try { globalThis.${ns} = globalThis.${ns} || {}; } catch {}`;
			})
			.join('\n');

		return [
			...(cssImports ? [cssImports] : []),
			`export * from '${normalizedPath}';`,
			`import * as __ns__ from '${normalizedPath}';`,
			nsInit,
			`for (const [k, v] of Object.entries(__ns__)) { try { globalThis.${namespace}[k] = v; } catch {} }`,
		].join('\n');
	}

	static #buildCssInjectProxy(inputPath: string, cssDeps: string[]): string
	{
		const normalizedPath = inputPath.replaceAll('\\', '/');
		const cssImports = cssDeps
			.map((cssPath) => `import '${cssPath.replaceAll('\\', '/')}';`)
			.join('\n');

		return [
			cssImports,
			`export * from '${normalizedPath}';`,
		].join('\n');
	}

	static #getExtensionCssPath(extensionName: string): string | null
	{
		// First try: extension with bundle.config (has source CSS input)
		const extension = PackageResolver.resolve(extensionName);
		if (extension)
		{
			const inputPath = extension.getInputPath();
			if (inputPath.endsWith('.css'))
			{
				return inputPath;
			}

			return null;
		}

		// Second try: extension without bundle.config (only config.php with dist CSS)
		const extensionDir = findExtensionPath(extensionName);
		if (!extensionDir)
		{
			return null;
		}

		const configPhpPath = path.join(extensionDir, 'config.php');
		if (!fs.existsSync(configPhpPath))
		{
			return null;
		}

		const phpConfig = new PhpConfigManager();
		phpConfig.loadFromFile(configPhpPath);

		const cssPath = phpConfig.get('css');
		if (typeof cssPath !== 'string')
		{
			return null;
		}

		// Try relative to extension directory first
		const relativeCssPath = path.join(extensionDir, cssPath);
		if (fs.existsSync(relativeCssPath))
		{
			return relativeCssPath;
		}

		// Handle absolute Bitrix paths like "/bitrix/js/ui/forms/ui.forms.css"
		// by extracting just the filename and looking in extension directory
		const baseName = path.basename(cssPath);
		const fallbackPath = path.join(extensionDir, baseName);
		if (fs.existsSync(fallbackPath))
		{
			return fallbackPath;
		}

		return null;
	}

	static #collectCssOnlyDependencies(extensionName: string, visited: Set<string>): string[]
	{
		if (visited.has(extensionName))
		{
			return [];
		}

		visited.add(extensionName);

		const extensionDir = (() => {
			const extension = PackageResolver.resolve(extensionName);
			if (extension)
			{
				return extension.getPath();
			}

			return findExtensionPath(extensionName);
		})();

		if (!extensionDir)
		{
			return [];
		}

		const configPhpPath = path.join(extensionDir, 'config.php');
		if (!fs.existsSync(configPhpPath))
		{
			return [];
		}

		const phpConfig = new PhpConfigManager();
		phpConfig.loadFromFile(configPhpPath);

		const rel: string[] = phpConfig.get('rel') ?? [];
		const cssPaths: string[] = [];

		for (const depName of rel)
		{
			const cssPath = RollupBuildStrategy.#getExtensionCssPath(depName);
			if (cssPath)
			{
				cssPaths.push(cssPath);
			}

			// Recurse into CSS-only dependency's own deps
			cssPaths.push(...RollupBuildStrategy.#collectCssOnlyDependencies(depName, visited));
		}

		return cssPaths;
	}

	static #resolveRemap(
		remap: Record<string, RemapTarget>,
		id: string,
	): { extension?: string; npm?: string; from?: string }
	{
		const entry = RollupBuildStrategy.#findRemapEntry(remap, id);
		if (!entry)
		{
			return {};
		}

		if (typeof entry === 'string')
		{
			return { extension: entry };
		}

		return { npm: entry.npm, from: entry.from };
	}

	static #findRemapEntry(
		remap: Record<string, RemapTarget>,
		id: string,
	): RemapTarget | null
	{
		if (id in remap)
		{
			return remap[id];
		}

		for (const [pattern, target] of Object.entries(remap))
		{
			if (!pattern.includes('*'))
			{
				continue;
			}

			const prefix = pattern.slice(0, pattern.indexOf('*'));
			if (!id.startsWith(prefix))
			{
				continue;
			}

			const matched = id.slice(prefix.length);

			if (typeof target === 'string')
			{
				return target.includes('*') ? target.replace('*', matched) : target;
			}

			return {
				npm: target.npm.includes('*') ? target.npm.replace('*', matched) : target.npm,
				from: target.from,
			};
		}

		return null;
	}

	static #resolveTreeshake(
		value?: boolean | TreeshakingPreset | TreeshakingOptions,
	): boolean | TreeshakingPreset | TreeshakingOptions
	{
		if (value === false)
		{
			return false;
		}

		if (typeof value === 'string')
		{
			return value;
		}

		if (typeof value === 'object')
		{
			return value;
		}

		return true;
	}

	protected static createTerserPlugin(options: import('terser').MinifyOptions): Plugin
	{
		return {
			name: 'terser',
			async renderChunk(code) {
				const { minify } = await import('terser');
				// sourceMap: true makes terser emit a delta map (input → minified) that Rollup
				// composes with the chunk's map. Without it minification would drop the map.
				const result = await minify(code, { ...options, sourceMap: true });

				if (!result.code && result.code !== '')
				{
					const { ChefError } = await import('../../../../diagnostics/chef-error');
					throw new ChefError(CF.MINIFICATION_ERROR, 'Terser returned empty result');
				}

				return {
					code: result.code!,
					map: result.map ? (typeof result.map === 'string' ? JSON.parse(result.map) : result.map) : null,
				};
			},
		};
	}

	async build(options: BuildOptions): Promise<BuildResult>
	{
		if (options.typescript)
		{
			const typeCheckResult = await this.#checkTypes(options);
			if (typeCheckResult.errors.length > 0)
			{
				return {
					dependencies: [],
					bundles: [],
					warnings: [],
					errors: typeCheckResult.errors,
					standalone: options.standalone ?? false,
				};
			}
		}

		const { onWarning, warningsRef, errorsRef, dependenciesRef, pendingCircularRef } = RollupBuildStrategy.createOnWarningHandler();
		const inputOptions: InputOptions = await this.#buildRollupInputOptions(options, onWarning, dependenciesRef);

		let bundle: RollupBuild;
		try
		{
			bundle = await rollup(inputOptions);
		}
		catch (error)
		{
			return {
				dependencies: [],
				bundles: [],
				warnings: [],
				errors: [RollupBuildStrategy.toDiagnostic(error)],
				standalone: options.standalone ?? false,
			};
		}

		const outputOptions: OutputOptions = this.#buildRollupOutputOptions(options);
		const globals = RollupBuildStrategy.makeGlobals(dependenciesRef);

		let result: RollupOutput;
		try
		{
			result = await bundle.write({ ...outputOptions, globals })
		}
		catch (error)
		{
			return {
				dependencies: [],
				bundles: [],
				warnings: [],
				errors: [RollupBuildStrategy.toDiagnostic(error)],
				standalone: options.standalone ?? false,
			};
		}

		await bundle.close();

		RollupBuildStrategy.#removeEmptyChunks(result.output, options.output.js);

		for (const ids of pendingCircularRef)
		{
			warningsRef.push(await RollupBuildStrategy.#resolveCircularWarning(ids));
		}

		const bundlesSize = RollupBuildStrategy.calculateBundlesSize(result.output);
		const sortedDependencies = RollupBuildStrategy.sortDependencies(dependenciesRef)

		return {
			dependencies: sortedDependencies,
			bundles: bundlesSize,
			warnings: [...warningsRef],
			errors: [...errorsRef],
			standalone: options.standalone ?? false,
		};
	}

	async buildCode(options: BuildCodeOptions): Promise<BuildCodeResult>
	{
		const { onWarning, warningsRef, errorsRef, dependenciesRef, pendingCircularRef } = RollupBuildStrategy.createOnWarningHandler();
		const rollupInputOptions: InputOptions = await this.#buildRollupBuildCodeInputOptions(
			options,
			onWarning,
			dependenciesRef,
		);

		const bundle: RollupBuild = await rollup({
			...rollupInputOptions,
			cache: this.#buildCodeCache,
		});
		this.#buildCodeCache = bundle.cache;

		const outputOptions: OutputOptions = this.#buildRollupBuildCodeOutputOptions(options);
		const globals = RollupBuildStrategy.makeGlobals(dependenciesRef);
		const result: RollupOutput = await bundle.generate({
			...outputOptions,
			globals: {
				...globals,
				mocha: 'window',
				chai: 'window',
				sinon: 'window',
			},
		});

		await bundle.close();

		for (const ids of pendingCircularRef)
		{
			warningsRef.push(await RollupBuildStrategy.#resolveCircularWarning(ids));
		}

		const outputEntry = result.output.at(0) as OutputChunk;
		const cssAsset = result.output.find(
			(item) => item.type === 'asset' && item.fileName.endsWith('.css'),
		);

		return {
			code: outputEntry?.code,
			css: (cssAsset?.type === 'asset' ? cssAsset.source as string : '') ?? '',
			map: outputEntry?.map ?? null,
			dependencies: [...dependenciesRef],
			warnings: [...warningsRef],
			errors: [...errorsRef],
		};
	}

	async generate(options: BuildOptions): Promise<BuildResult>
	{
		if (options.typescript)
		{
			const typeCheckResult = await this.#checkTypes(options);
			if (typeCheckResult.errors.length > 0)
			{
				return {
					dependencies: [],
					bundles: [],
					warnings: [],
					errors: typeCheckResult.errors,
					standalone: options.standalone ?? false,
				};
			}
		}

		const { onWarning, warningsRef, errorsRef, dependenciesRef, pendingCircularRef } = RollupBuildStrategy.createOnWarningHandler();
		const inputOptions: InputOptions = await this.#buildRollupInputOptions(options, onWarning, dependenciesRef);

		let bundle: RollupBuild;
		try
		{
			bundle = await rollup(inputOptions);
		}
		catch (error)
		{
			return {
				dependencies: [],
				bundles: [],
				warnings: [],
				errors: [RollupBuildStrategy.toDiagnostic(error)],
				standalone: options.standalone ?? false,
			};
		}

		const outputOptions: OutputOptions = this.#buildRollupOutputOptions(options);
		const globals = RollupBuildStrategy.makeGlobals(dependenciesRef);

		let result: RollupOutput;
		try
		{
			result = await bundle.generate({ ...outputOptions, globals })
		}
		catch (error)
		{
			return {
				dependencies: [],
				bundles: [],
				warnings: [],
				errors: [RollupBuildStrategy.toDiagnostic(error)],
				standalone: options.standalone ?? false,
			};
		}

		await bundle.close();

		RollupBuildStrategy.#removeEmptyChunks(result.output, options.output.js);

		for (const ids of pendingCircularRef)
		{
			warningsRef.push(await RollupBuildStrategy.#resolveCircularWarning(ids));
		}

		const bundlesSize = RollupBuildStrategy.calculateBundlesSize(result.output);
		const sortedDependencies = RollupBuildStrategy.sortDependencies(dependenciesRef)

		return {
			dependencies: sortedDependencies,
			bundles: bundlesSize,
			warnings: [...warningsRef],
			errors: [...errorsRef],
			standalone: options.standalone ?? false,
		};
	}

	async #loadTsConfig(configPath: string, packageRoot: string): Promise<ParsedCommandLine>
	{
		return loadTsConfig(configPath, packageRoot);
	}

	async #createTypeScriptPlugin(tsConfig: ParsedCommandLine, packageRoot: string, overrides?: { include?: string[] }): Promise<Plugin>
	{
		const { default: bitrixTypescriptPlugin } = await import('./plugins/typescript');

		const typesPath = (() => {
			const devExtension = PackageResolver.resolve('ui.dev');
			if (devExtension)
			{
				return devExtension.getInputPath();
			}

			return '';
		})();

		return bitrixTypescriptPlugin({
			packageRoot,
			compilerOptions: {
				paths: tsConfig.options.paths,
				baseUrl: tsConfig.options.baseUrl,
				types: typesPath ? [typesPath] : [],
			},
			include: overrides?.include,
			exclude: [
				...(tsConfig?.raw?.exclude ?? []),
				`${normalizePath(packageRoot)}/dist/**`,
			],
		});
	}

	async #checkTypes(options: BuildOptions): Promise<import('./plugins/typescript').TypeCheckResult>
	{
		const { checkTypes } = await import('./plugins/typescript');

		const tsConfigPath = FileFinder.findUpFile({
			fileName: 'tsconfig.json',
			fromDir: path.dirname(options.input),
			rootDir: Environment.getRoot() ?? undefined,
		});

		let compilerOptions: import('typescript').CompilerOptions | undefined;
		if (typeof tsConfigPath === 'string' && tsConfigPath.length > 0)
		{
			const tsConfig = await this.#loadTsConfig(tsConfigPath, options.packageRoot);
			compilerOptions = tsConfig.options;
		}

		return checkTypes({
			packageRoot: options.packageRoot,
			compilerOptions,
			exclude: [
				options.output.js,
				options.output.css,
			],
			// TS2307: Cannot find module — expected in standalone mode where Bitrix extensions
			// are resolved by Rollup, not TypeScript
			...(options.standalone ? { ignoreCodes: [2307] } : {}),
		});
	}

	async #createVuePlugin(options: BuildOptions): Promise<Plugin>
	{
		const { default: vuePlugin } = await import('unplugin-vue');

		return vuePlugin.rollup({
			isProduction: options.production ?? false,
		}) as Plugin;
	}

	async #loadBuildPlugins(options: BuildOptions)
	{
		const [
			{ default: nodeResolve },
			{ default: commonjs },
			{ default: jsonPlugin },
			{ default: urlPlugin },
			{ default: cssPlugin },
		] = await Promise.all([
			import('@rollup/plugin-node-resolve'),
			import('@rollup/plugin-commonjs'),
			import('@rollup/plugin-json'),
			import('@rollup/plugin-url'),
			import('./plugins/css'),
		]);

		const babelPlugins = await this.#loadBabelPlugins({
			...options,
			// Standalone builds inline dependencies, which may be TS or Flow
			// regardless of the entry package language.
			includeTypescriptSource: (options.typescript ?? false) || (options.standalone ?? false),
			includeFlowSource: !options.typescript || (options.standalone ?? false),
		});

		return {
			nodeResolve,
			commonjs,
			jsonPlugin,
			urlPlugin,
			cssPlugin,
			babelPlugins,
		};
	}

	async #loadBabelPlugins(options: {
		babel?: boolean,
		includeTypescriptSource: boolean,
		includeFlowSource: boolean,
		targets: string[],
		transformClasses?: boolean | string[],
		packageRoot: string,
	}): Promise<Plugin[]>
	{
		if (options.babel === false)
		{
			return [];
		}

		const [
			{ default: babelPlugin },
			{ default: presetEnv },
			{ default: flowStripTypesPlugin },
			{ default: externalHelpersPlugin },
		] = await Promise.all([
			import('@rollup/plugin-babel'),
			import('@babel/preset-env'),
			import('@babel/plugin-transform-flow-strip-types'),
			import('@babel/plugin-external-helpers'),
		]);

		const extensions = ['.js', '.jsx', '.mjs'];
		if (options.includeTypescriptSource)
		{
			extensions.push('.ts', '.tsx');
		}

		const basePlugins = [
			...(options.includeFlowSource ? [flowStripTypesPlugin] : []),
			externalHelpersPlugin,
		];

		if (options.transformClasses === true)
		{
			basePlugins.push(...await this.#loadClassTransformPlugins());
		}

		const result: Plugin[] = [
			babelPlugin({
				babelHelpers: 'external',
				extensions,
				compact: false,
				presets: [
					[
						presetEnv,
						{
							targets: options.targets,
							modules: false,
						},
					],
				],
				plugins: basePlugins,
			}),
		];

		if (Array.isArray(options.transformClasses))
		{
			const { default: filterClassTransform } = await import('./plugins/filter-class-transform');
			result.push(filterClassTransform({
				classNames: options.transformClasses,
				extensions,
			}));
		}

		return result;
	}

	async #loadClassTransformPlugins(): Promise<any[]>
	{
		const [
			{ default: transformClassProperties },
			{ default: transformPrivateMethods },
			{ default: transformPrivatePropertyInObject },
			{ default: transformClasses },
		] = await Promise.all([
			import('@babel/plugin-transform-class-properties'),
			import('@babel/plugin-transform-private-methods'),
			import('@babel/plugin-transform-private-property-in-object'),
			import('@babel/plugin-transform-classes'),
		]);

		return [
			transformClassProperties,
			transformPrivateMethods,
			transformPrivatePropertyInObject,
			transformClasses,
		];
	}

	async #buildRollupInputOptions(options: BuildOptions, onWarn: WarningHandlerWithDefault, dependenciesRef: string[]): Promise<InputOptions>
	{
		const {
			nodeResolve,
			commonjs,
			jsonPlugin,
			urlPlugin,
			cssPlugin,
			babelPlugins,
		} = await this.#loadBuildPlugins(options);

		const isCssOnly = options.input.endsWith('.css');

		// Collect CSS-only dependencies for the entry package in standalone mode
		const entryCssDeps = (() => {
			if (!options.standalone || !options.packageName)
			{
				return [];
			}

			const visited = new Set<string>();

			return RollupBuildStrategy.#collectCssOnlyDependencies(options.packageName, visited);
		})();

		const hasEntryCssDeps = entryCssDeps.length > 0;
		const inputId = (() => {
			if (hasEntryCssDeps)
			{
				return '\0standalone-entry';
			}

			if (isCssOnly)
			{
				return '\0css-entry';
			}

			return options.input;
		})();

		return {
			input: inputId,
			plugins: [
				...(hasEntryCssDeps ? [RollupBuildStrategy.createVirtualEntryPlugin({
					'\0standalone-entry': [
						...entryCssDeps.map((cssPath) => `import '${cssPath.replaceAll('\\', '/')}';`),
						isCssOnly
							? `import '${options.input.replaceAll('\\', '/')}';`
							: `export * from '${options.input.replaceAll('\\', '/')}';`,
					].join('\n'),
				})] : []),
				...(isCssOnly && !hasEntryCssDeps ? [RollupBuildStrategy.createVirtualEntryPlugin({
					'\0css-entry': `import '${options.input.replaceAll('\\', '/')}';`,
				})] : []),
				RollupBuildStrategy.createEnvReplacePlugin(options.production ?? false),
				RollupBuildStrategy.createNpmRemapPlugin(dependenciesRef),
				...await (async () => {
					if (options.baseline)
					{
						const { default: baselineCheckPlugin } = await import('./plugins/baseline-check');

						return [baselineCheckPlugin({
							targets: options.targets,
							packageRoot: options.packageRoot,
						})];
					}

					return [];
				})(),
				...(() => {
					if (options.standalone)
					{
						return [
							RollupBuildStrategy.createStandalonePlugin({
								currentPackageName: options.packageName,
								currentNamespace: options.namespace,
								dependenciesRef,
								remap: options.standaloneRemap,
								exposeNamespaces: options.standaloneExposeNamespaces,
							}),
						];
					}

					return [];
				})(),
				await (async () => {
					if (options.vue || options.standalone)
					{
						return this.#createVuePlugin(options);
					}

					return null;
				})(),
				await (async () => {
					if (options.typescript || options.standalone)
					{
						const rootDir = Environment.getRoot() ?? undefined;
						const tsConfigPath = FileFinder.findUpFile({
							fileName: 'tsconfig.json',
							fromDir: path.dirname(options.input),
							rootDir,
						});

						if (typeof tsConfigPath === 'string' && tsConfigPath.length > 0)
						{
							const tsConfig = await this.#loadTsConfig(
								tsConfigPath,
								options.packageRoot,
							);

							return await this.#createTypeScriptPlugin(
								tsConfig,
								rootDir ?? options.packageRoot,
							);
						}
					}

					return Promise.resolve();
				})(),
				(() => {
					if (options.resolve || options.standalone)
					{
						return nodeResolve({
							browser: true,
							exportConditions: options.production ? ['production'] : ['development'],
						});
					}

					return null;
				})(),
				...babelPlugins,
				jsonPlugin(),
				cssPlugin({
					extract: options.output.css,
					targets: options.targets,
					cssImages: options.cssImages,
					packageRoot: options.packageRoot,
					publicPath: options.publicPath,
				}),
				commonjs({
					sourceMap: false,
				}),
				urlPlugin({
					limit: 0,
					emitFiles: true,
					fileName: 'assets/[name][extname]',
					publicPath: normalizePath(path.join(
						options.publicPath,
						path.relative(
							options.packageRoot,
							path.dirname(
								options.output.js,
							),
						),
						'/',
					)),
				}),
				concatPlugin({
					jsFiles: (options.concat?.js ?? []).map(
						(filePath) => path.resolve(options.packageRoot, filePath),
					),
					cssFiles: (options.concat?.css ?? []).map(
						(filePath) => path.resolve(options.packageRoot, filePath),
					),
				}),
				...(options.customPlugins ?? []),
				...(options.typescript ? [stripCommentsPlugin({ banner: '/* eslint-disable */' })] : []),
				...(options.minify ? [] : [tabIndentPlugin()]),
				...(options.minify ? [RollupBuildStrategy.createTerserPlugin(typeof options.minify === 'object' ? options.minify : {})] : []),
				...(options.safeNamespaces ? [safeNamespacesPlugin()] : []),
			],
			onwarn: onWarn,
			treeshake: RollupBuildStrategy.#resolveTreeshake(options.treeshake),
		}
	}

	#buildRollupOutputOptions(options: BuildOptions): OutputOptions
	{
		return {
			file: options.output.js,
			name: options?.namespace ?? 'window',
			format: 'iife',
			banner: '/* eslint-disable */',
			extend: true,
			sourcemap: options?.sourceMaps ?? true,
			// Bitrix extensions are loaded as IIFE scripts into a shared BX.* namespace.
			// Rollup's default live-binding getters (`Object.defineProperty(exports, "X", { get })`)
			// become self-referential when both bundles share a namespace, causing runtime
			// "Maximum call stack size exceeded". Static assignments match the old pre-Rollup
			// build behaviour and are safe here: dependencies load sequentially via `rel`,
			// so values are already in place by the time the current bundle runs.
			externalLiveBindings: false,
			...(options.standalone ? {
				intro: 'var __originalExports__ = exports;',
			} : {}),
		};
	}

	async #buildRollupBuildCodeInputOptions(options: BuildCodeOptions, onWarning: WarningHandlerWithDefault, dependenciesRef: string[]): Promise<InputOptions>
	{
		const [
			{ default: nodeResolve },
			{ default: commonjs },
			{ default: jsonPlugin },
			babelPlugins,
		] = await Promise.all([
			import('@rollup/plugin-node-resolve'),
			import('@rollup/plugin-commonjs'),
			import('@rollup/plugin-json'),
			this.#loadBabelPlugins({
				...options,
				packageRoot: options.packageRoot,
				// Test bundles may contain TS and Flow source from currentPackage
				includeTypescriptSource: true,
				includeFlowSource: true,
			}),
		]);

		return {
			input: 'source-code.js',
			plugins: [
				RollupBuildStrategy.createVirtualEntryPlugin({
					'source-code.js': options.code,
				}),
				RollupBuildStrategy.createNpmRemapPlugin(dependenciesRef),
				RollupBuildStrategy.createEnvReplacePlugin(false),
				RollupBuildStrategy.createCurrentPackageResolver(options.packageName),
				await (async () => {
					const rootDir = Environment.getRoot();
					if (rootDir)
					{
						const tsConfigPath = FileFinder.findUpFile({
							fileName: 'tsconfig.json',
							fromDir: options.packageRoot,
							rootDir,
						});

						if (typeof tsConfigPath === 'string' && tsConfigPath.length > 0)
						{
							const tsConfig = await this.#loadTsConfig(
								tsConfigPath,
								options.packageRoot,
							);

							return await this.#createTypeScriptPlugin(
								tsConfig,
								options.packageRoot,
								{ include: ['**'] },
							);
						}
					}

					return await this.#createTypeScriptPlugin(
						{ options: { paths: undefined, baseUrl: undefined }, raw: {} } as any,
						options.packageRoot,
						{ include: ['**'] },
					);
				})(),
				(await import('./plugins/css')).default({
					extract: 'bundle.css',
					targets: options.targets,
					packageRoot: options.packageRoot,
				}),
				nodeResolve({
					browser: true,
				}),
				...babelPlugins,
				jsonPlugin(),
				commonjs({
					sourceMap: false,
				}),
				tabIndentPlugin(),
			],
			onwarn: onWarning,
			treeshake: false,
			external: [
				'mocha',
				'chai',
				'sinon',
			],
		}
	}

	#buildRollupBuildCodeOutputOptions(options: BuildCodeOptions): OutputOptions
	{
		return {
			file: 'source-code.bundle.js',
			name: options.namespace,
			format: 'iife',
			banner: '/* eslint-disable */',
			extend: true,
			intro: 'var global = globalThis; var exports = {}; var module = { exports: exports };',
			sourcemap: options.sourcemap ?? false,
		};
	}
}
