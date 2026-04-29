import type { Plugin, TreeshakingOptions, TreeshakingPreset } from 'rollup';
import type { MinifyOptions } from 'terser';

export interface PreparedBundleConfig {
	input: string;
	types: string | null;
	output: { js: string; css: string };
	namespace: string;
	concat: {
		js?: string[];
		css?: string[];
	};
	adjustConfigPhp: boolean;
	treeshake: boolean | TreeshakingPreset | TreeshakingOptions;
	'protected': boolean;
	plugins: Plugin[];
	resolveNodeModules: boolean;
	babel: boolean;
	cssImages?: {
		type: 'inline' | 'copy';
		output: string;
		maxSize: number;
		svgo: boolean;
	};
	resolveFilesImport: {
		output: string;
		include: string[];
		exclude: string[];
	};
	targets: string | string[] | undefined;
	minification: boolean | MinifyOptions;
	transformClasses: boolean | string[];
	sourceMaps: boolean;
	emitDeclaration: import('./strategies/emit-declaration-strategy').EmitDeclarationConfig;
	safeNamespaces: boolean;
	baseline: boolean;
	alias: boolean;
	tests: {
		localization: {
			languageId: string;
			autoLoad: boolean;
		};
	};
}
