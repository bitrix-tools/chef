import type { RollupLog, Plugin } from 'rollup';
import type { MinifyOptions } from 'terser';

export interface BundleFileInfo {
	fileName: string;
	size: number;
}

export interface BuildResult {
	warnings: RollupLog[];
	errors: RollupLog[];
	bundles: BundleFileInfo[];
	dependencies: string[];
	standalone: boolean;
}

export type BuildOptions = {
	input: string;
	output: { js: string, css: string };
	packageRoot: string,
	publicPath: string,
	targets: string[];
	namespace: string;
	typescript?: boolean;
	standalone?: boolean;
	concat?: {
		js?: Array<string>;
		css?: Array<string>;
	};
	resolve?: boolean,
	cssImages?: {
		type: 'inline' | 'copy',
		maxSize: number,
	},
	resolveFiles?: {
		include?: string[];
		exclude?: string[];
	},
	minify?: boolean | MinifyOptions,
	sourceMaps?: boolean,
	vue?: boolean,
	transformClasses?: boolean,
	babel?: boolean,
	customPlugins?: Plugin[],
	production?: boolean,
};

export type BuildCodeOptions = {
	code: string;
	packageRoot: string,
	publicPath: string,
	targets: string[];
	namespace: string;
	typescript?: boolean;
	resolve?: boolean,
	standalone?: boolean;
	sourcemap?: boolean;
};

export interface BuildCodeResult {
	warnings: RollupLog[];
	errors: RollupLog[];
	code: string;
	dependencies: string[];
}
