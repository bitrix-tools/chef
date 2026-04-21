import type { Plugin, TreeshakingOptions, TreeshakingPreset } from 'rollup';
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
