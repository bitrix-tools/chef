import type { Plugin, TreeshakingOptions, TreeshakingPreset } from 'rollup';
import type { MinifyOptions } from 'terser';

export interface PreparedBundleConfig {
	input: string;
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
	transformClasses: boolean;
	sourceMaps: boolean;
	emitDeclaration: boolean;
	safeNamespaces: boolean;
	baseline: boolean;
	tests: {
		localization: {
			languageId: string;
			autoLoad: boolean;
		};
	};
}
