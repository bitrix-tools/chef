import path from 'node:path';

import fg from 'fast-glob';

import { ChefConfigManager } from '../config/project/chef-config-manager';
import { validateBuildOptions } from '../config/project/chef-config-validator';
import { DeclarationEmitter } from '../engines/build/declaration-emitter';
import type { DeclarationDiagnostic } from '../engines/build/declaration/declaration-bundler';
import { Environment } from '../../environment/environment';
import { FileFinder } from '../../utils/file-finder';
import { loadTsConfig } from '../../utils/load-tsconfig';
import { emitDeclarationStrategy } from '../config/bundle/strategies/emit-declaration-strategy';
import { findReExports } from '../../utils/ast/find-re-exports';
import { findImportLocation } from '../../utils/ast/find-import-location';
import { findCircularDependencies } from '../../utils/package/find-circular-dependencies';
import { PackageResolver } from '../packages/package-resolver';
import { CF } from '../../diagnostics/diagnostic-codes';
import type { BasePackage } from '../packages/base-package';
import type { BuildEngine } from '../engines/build/build-engine';
import type { BuildOptions, BuildResult, BuildDiagnostic } from '../engines/build/build-types';

export class PackageBuilder
{
	readonly #package: BasePackage;

	constructor(extensionPackage: BasePackage)
	{
		this.#package = extensionPackage;
	}

	async build(options: { force?: boolean } = {}): Promise<BuildResult>
	{
		const buildEngine = await PackageBuilder.getBuildEngine();
		const buildOptions = this.#getBuildOptions();

		const validation = options.force ? null : await this.#validateBuildOptions(buildOptions);
		if (validation && 'denied' in validation)
		{
			return validation.denied;
		}

		const buildResult = await buildEngine.build(buildOptions);

		if (buildResult.errors.length === 0 && buildOptions.emitDeclaration?.enabled && buildOptions.typescript)
		{
			const declarationDiagnostics = await this.#emitDeclaration(buildOptions);
			// Declaration emit issues (e.g. inlined sibling shapes) only affect the .d.ts —
			// the JS bundle is already produced. Surface them as warnings so the build does
			// not fail and the user sees what to fix to get a clean .d.ts.
			for (const diagnostic of declarationDiagnostics)
			{
				buildResult.warnings.push({
					code: diagnostic.code > 0 ? `TS${diagnostic.code}` : 'CHEF_DTS',
					message: diagnostic.message,
					details: diagnostic.details,
					loc: diagnostic.file && diagnostic.line !== null && diagnostic.column !== null
						? { file: diagnostic.file, line: diagnostic.line, column: diagnostic.column }
						: undefined,
				});
			}
		}

		if (validation && 'warnings' in validation)
		{
			buildResult.warnings.push(...validation.warnings.map((message) => ({ message })));
		}

		if (buildResult.errors.length === 0)
		{
			// Diagnostics only — failures here must not affect the produced JS bundle.
			try
			{
				const reExportWarnings = await this.#detectRiskyReExports();
				buildResult.warnings.push(...reExportWarnings);
			}
			catch
			{
				// Swallow: re-export diagnostics are best-effort.
			}

			try
			{
				const circularWarnings = await this.#detectCircularDependencies();
				buildResult.warnings.push(...circularWarnings);
			}
			catch
			{
				// Swallow: circular-deps diagnostics are best-effort.
			}
		}

		const phpConfig = this.#package.getPhpConfig();

		// Filter out dependencies that are already included in the bundle
		const includes = new Set<string>(phpConfig.get('includes') ?? []);
		const dependencies = buildResult.dependencies.filter(dep => !includes.has(dep));

		phpConfig.set('rel', dependencies);

		if (this.#package.shouldUpdatePhpConfig())
		{
			phpConfig.save(this.#package.getPhpConfigFilePath(), this.#package.getName());
		}

		return buildResult;
	}

	async generate(): Promise<BuildResult>
	{
		const buildEngine = await PackageBuilder.getBuildEngine();
		const buildOptions = this.#getBuildOptions();

		const validation = await this.#validateBuildOptions(buildOptions);
		if (validation && 'denied' in validation)
		{
			return validation.denied;
		}

		const buildResult = await buildEngine.generate(buildOptions);

		if (validation && 'warnings' in validation)
		{
			buildResult.warnings.push(...validation.warnings.map((message) => ({ message })));
		}

		return buildResult;
	}

	#getBuildOptions(): BuildOptions
	{
		const bundleConfig = this.#package.getBundleConfig();
		const chefConfig = ChefConfigManager.getInstance().getConfig();
		const defaults = chefConfig.defaults;
		const enforce = chefConfig.enforce;

		const production = bundleConfig.get('production');

		return {
			input: this.#package.getInputPath(),
			output: {
				js: this.#package.getOutputJsPath(),
				css: this.#package.getOutputCssPath(),
			},
			packageRoot: this.#package.getPath(),
			publicPath: this.#package.getPublicPath(),
			targets: [enforce?.targets ?? this.#package.getTargets() ?? defaults?.targets].flat(),
			namespace: bundleConfig.get('namespace'),
			packageName: this.#package.getName(),
			typescript: this.#package.isTypeScriptMode(),
			vue: this.#hasVueFiles(),
			concat: bundleConfig.get('concat'),
			cssImages: bundleConfig.get('cssImages'),
			resolveFiles: bundleConfig.get('resolveFilesImport'),
			minify: bundleConfig.get('minification'),
			sourceMaps: enforce?.sourceMaps
				?? (bundleConfig.has('sourceMaps')
					? bundleConfig.get('sourceMaps')
					: (defaults?.sourceMaps ?? true)),
			standalone: bundleConfig.get('standalone').enabled,
			standaloneRemap: bundleConfig.get('standalone').remap,
			standaloneExposeNamespaces: bundleConfig.get('standalone').exposeNamespaces,
			resolve: bundleConfig.get('resolveNodeModules'),
			babel: enforce?.babel ?? bundleConfig.get('babel'),
			transformClasses: bundleConfig.get('transformClasses'),
			treeshake: bundleConfig.get('treeshake'),
			customPlugins: bundleConfig.get('plugins'),
			production,
			emitDeclaration: emitDeclarationStrategy.prepare(
				enforce?.emitDeclaration
					?? (bundleConfig.has('emitDeclaration')
						? bundleConfig.get('emitDeclaration')
						: (defaults?.emitDeclaration ?? true)),
			),
			safeNamespaces: bundleConfig.get('safeNamespaces'),
			baseline: enforce?.baseline
				?? (bundleConfig.has('baseline')
					? bundleConfig.get('baseline')
					: (defaults?.baseline ?? bundleConfig.get('baseline'))),
		};
	}

	async #validateBuildOptions(buildOptions: BuildOptions): Promise<{ denied: BuildResult } | { warnings: string[] } | null>
	{
		const chefConfig = ChefConfigManager.getInstance().getConfig();
		const issues = await validateBuildOptions(buildOptions, chefConfig);

		if (issues.length === 0)
		{
			return null;
		}

		const errors = issues.filter((i) => i.severity === 'error');
		const warnings = issues.filter((i) => i.severity === 'warning');

		if (errors.length > 0)
		{
			return {
				denied: {
					dependencies: [],
					bundles: [],
					warnings: warnings.map((w) => ({ code: w.code, message: w.message })),
					errors: errors.map((e) => ({ code: e.code, message: e.message })),
					standalone: buildOptions.standalone ?? false,
				},
			};
		}

		return { warnings: warnings.map((w) => w.message) };
	}

	async #emitDeclaration(options: BuildOptions): Promise<DeclarationDiagnostic[]>
	{
		const outputPath = options.output.js.replace(/\.js$/, '.d.ts');
		const emitter = new DeclarationEmitter();

		const tsConfigPath = FileFinder.findUpFile({
			fileName: 'tsconfig.json',
			fromDir: path.dirname(options.input),
			rootDir: Environment.getRoot() ?? undefined,
		});

		let compilerOptions: import('typescript').CompilerOptions | undefined;
		if (typeof tsConfigPath === 'string' && tsConfigPath.length > 0)
		{
			const tsConfig = await loadTsConfig(tsConfigPath, options.packageRoot);
			compilerOptions = tsConfig.options;
		}

		const extensionName = options.packageName ?? this.#package.getName();
		const mode = options.emitDeclaration?.mode ?? 'ambient';

		return emitter.emit({
			packageRoot: options.packageRoot,
			input: options.input,
			namespace: options.namespace,
			outputPath,
			extensionName,
			mode,
			moduleName: extensionName,
			compilerOptions,
		});
	}

	#hasVueFiles(): boolean
	{
		return fg.sync('src/**/*.vue', { cwd: this.#package.getPath() }).length > 0;
	}

	/**
	 * Surface re-exports of symbols from sibling extensions that share this package's namespace.
	 * In IIFE bundles these would historically produce a self-referential live-binding getter and
	 * crash at runtime; `output.externalLiveBindings: false` now compiles them to plain assignments,
	 * which is safe but still indicates an architectural smell — the consumer ends up "shadowing"
	 * names that already exist in the source extension under the same global namespace.
	 */
	async #detectRiskyReExports(): Promise<BuildDiagnostic[]>
	{
		const ownNamespace = this.#package.getBundleConfig().get('namespace') ?? '';
		const dependencies = await this.#package.getDependencies();

		const knownExtensions = new Set<string>(dependencies.map((d) => d.name));
		knownExtensions.add(this.#package.getName());

		const entries = await findReExports(this.#package, knownExtensions);
		if (entries.length === 0)
		{
			return [];
		}

		const ownName = this.#package.getName();
		const packageRoot = this.#package.getPath();
		const warnings: BuildDiagnostic[] = [];

		for (const entry of entries)
		{
			const isSelfReference = entry.source === ownName;
			const sourceNamespace = isSelfReference
				? ownNamespace
				: PackageResolver.resolve(entry.source)?.getBundleConfig().get('namespace') ?? '';

			const sameNamespace = Boolean(ownNamespace) && sourceNamespace === ownNamespace;
			if (!isSelfReference && !sameNamespace)
			{
				continue;
			}

			const symbolList = entry.symbols.join(', ');
			const kind = isSelfReference ? 'self-reference' : 'shared namespace';
			const headline = entry.wildcard
				? `wildcard re-export from "${entry.source}" — ${kind}`
				: `re-export of ${symbolList} from "${entry.source}" — ${kind}`;

			const details = [
				`The current extension and "${entry.source}" share the namespace ${ownNamespace || '(none)'}.`,
				`Re-exporting from the same namespace shadows names that already exist on the global`,
				`object. Build no longer crashes at runtime (live bindings are compiled to assignments),`,
				`but the indirection is unnecessary — consumers can import directly from "${entry.source}".`,
			].join('\n');

			warnings.push({
				code: CF.RE_EXPORT_SHADOWING,
				message: headline,
				details,
				loc: { file: path.join(packageRoot, entry.file), line: entry.line, column: 1 },
			});
		}

		return warnings;
	}

	/**
	 * Surface direct circular dependencies declared in `config.php rel` (A → A self-dep,
	 * A → B → A mutual). Longer chains are not reported — they indicate tight coupling but
	 * rarely break at load time, so we leave them to `chef diag circular-deps`.
	 */
	async #detectCircularDependencies(): Promise<BuildDiagnostic[]>
	{
		const cycles = await findCircularDependencies({ target: this.#package });
		if (cycles.length === 0)
		{
			return [];
		}

		const details = [
			'Mutual dependencies cause load-order issues — one extension may initialise before',
			'the other is ready. To break the cycle:',
			'  • extract the shared code into a third extension, or',
			'  • invert one direction with event-based / late binding, or',
			'  • defer the import via `Runtime.loadExtension(\'partner.name\')` so the dependency',
			'    is fetched lazily at the moment of use instead of at module load time.',
		].join('\n');

		// Try to locate the offending import in JS sources of this package.
		// The cycle is declared in config.php (`rel`), but the actionable spot for the developer
		// is usually `import ... from 'partner'`. If the dependency exists only in config.php
		// without a matching JS import, leave the diagnostic without `loc`.
		const warnings: BuildDiagnostic[] = [];
		for (const cycle of cycles)
		{
			const partner = cycle[1];
			const location = await findImportLocation(this.#package, partner);

			warnings.push({
				code: CF.CIRCULAR_DEPENDENCY,
				message: `Circular dependency between extensions: ${cycle.join(' → ')}`,
				details,
				loc: location ?? undefined,
			});
		}

		return warnings;
	}

	static #buildEngine: Promise<BuildEngine> | null = null;

	static getBuildEngine(): Promise<BuildEngine>
	{
		if (!PackageBuilder.#buildEngine)
		{
			PackageBuilder.#buildEngine = (async () => {
				const [
					{ BuildEngine },
					{ RollupBuildStrategy },
				] = await Promise.all([
					import('../engines/build/build-engine'),
					import('../engines/build/rollup/rollup-strategy'),
				]);

				return new BuildEngine(new RollupBuildStrategy());
			})();
		}

		return PackageBuilder.#buildEngine;
	}
}
