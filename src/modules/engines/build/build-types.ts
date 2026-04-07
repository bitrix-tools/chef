import type { Plugin, TreeshakingOptions, TreeshakingPreset } from 'rollup';
import type { MinifyOptions } from 'terser';

export interface BuildDiagnostic {
	code?: string;
	message: string;
	frame?: string;
	loc?: { file: string; line: number; column: number };
	risk?: 'low' | 'medium' | 'high';
	unsupportedIn?: string;
	gapInfo?: string;
}

export interface BundleFileInfo {
	fileName: string;
	size: number;
}

export interface BuildResult {
	warnings: BuildDiagnostic[];
	errors: BuildDiagnostic[];
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
	treeshake?: boolean | TreeshakingPreset | TreeshakingOptions,
	minify?: boolean | MinifyOptions,
	sourceMaps?: boolean,
	vue?: boolean,
	transformClasses?: boolean,
	babel?: boolean,
	customPlugins?: Plugin[],
	production?: boolean,
	emitDeclaration?: boolean,
	safeNamespaces?: boolean,
	baseline?: boolean,
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
	warnings: BuildDiagnostic[];
	errors: BuildDiagnostic[];
	code: string;
	css: string;
	dependencies: string[];
	map?: import('rollup').SourceMap | null;
}
