import type { Plugin, TreeshakingOptions, TreeshakingPreset } from 'rollup';
import type { MinifyOptions } from 'terser';

export interface BundleConfig {
	input: string;
	/**
	 * Path to a TypeScript declaration file (`.d.ts`) that exposes the
	 * extension's design-time types. Used by `chef aliases` and
	 * `webpack.config.js` to resolve IDE imports of this extension to the
	 * declaration instead of `input`. Has no effect on the runtime build.
	 */
	types?: string;
	output: string | { js: string; css: string };
	namespace?: string;
	concat?: {
		js?: string[];
		css?: string[];
	};
	adjustConfigPhp?: boolean;
	treeshake?: boolean | TreeshakingPreset | TreeshakingOptions;
	'protected'?: boolean;
	plugins?: Plugin[];
	resolveNodeModules?: boolean;
	cssImages?: {
		type?: 'inline' | 'copy';
		output?: string;
		maxSize?: number;
		absolutePaths?: boolean;
	};
	resolveFilesImport?: {
		output?: string;
		include?: string[];
		exclude?: string[];
	};
	targets?: string | string[];
	/** @deprecated Use `targets` instead */
	browserslist?: string | string[];
	minification?: boolean | MinifyOptions;
	transformClasses?: boolean | string[];
	standalone?: boolean | {
		remap?: Record<string, string>;
	};
	sourceMaps?: boolean;
	tests?: {
		localization?: {
			languageId?: string;
			autoLoad?: boolean;
		};
	};
	rebuild?: string[];
	emitDeclaration?: boolean | 'ambient' | 'module' | 'both' | { enabled?: boolean; mode?: 'ambient' | 'module' | 'both' };
	/**
	 * Whether `chef aliases` should add this extension to `paths` in
	 * `aliases.tsconfig.json`. Default: `true`.
	 *
	 * Set to `false` for extensions that publish their own ambient module
	 * declaration (`declare module '<ext>' { ... }`) — a paths mapping would
	 * make the file simultaneously a primary module and an augmentation of
	 * itself, leading to TypeScript errors.
	 */
	alias?: boolean;
	safeNamespaces?: boolean;
	baseline?: boolean;
	production?: boolean;
}

/** @deprecated Use new format: `plugins: [...]` and `resolveNodeModules: true` */
export interface LegacyPluginsConfig {
	babel?: boolean;
	resolve?: boolean;
	custom?: Plugin[];
}
