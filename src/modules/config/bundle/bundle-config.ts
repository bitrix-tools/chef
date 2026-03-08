import type { Plugin } from 'rollup';
import type { MinifyOptions } from 'terser';

export interface BundleConfig {
	input: string;
	output: string | { js: string; css: string };
	namespace?: string;
	concat?: {
		js?: string[];
		css?: string[];
	};
	adjustConfigPhp?: boolean;
	treeshake?: boolean;
	'protected'?: boolean;
	plugins?: Plugin[];
	resolveNodeModules?: boolean;
	cssImages?: {
		type?: 'inline' | 'copy';
		output?: string;
		maxSize?: number;
		svgo?: boolean;
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
	transformClasses?: boolean;
	standalone?: boolean;
	sourceMaps?: boolean;
	tests?: {
		localization?: {
			languageId?: string;
			autoLoad?: boolean;
		};
	};
	rebuild?: string[];
}

/** @deprecated Use new format: `plugins: [...]` and `resolveNodeModules: true` */
export interface LegacyPluginsConfig {
	babel?: boolean;
	resolve?: boolean;
	custom?: Plugin[];
}
