import type { TransformOptions } from '@babel/core';
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
	treeshake: boolean;
	'protected': boolean;
	plugins: {
		babel?: boolean | TransformOptions;
		custom?: Array<string | ((...args: any[]) => any)>;
	};
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
	tests: {
		localization: {
			languageId: string;
			autoLoad: boolean;
		};
	};
}
