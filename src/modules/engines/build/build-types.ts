import type { Plugin, TreeshakingOptions, TreeshakingPreset } from 'rollup';
import type { MinifyOptions } from 'terser';
import type { RemapTarget } from '../../config/bundle/strategies/standalone-strategy';

export interface BuildDiagnostic {
	code?: string;
	message: string;
	/**
	 * Long-form explanation rendered **after** the code frame and `at file:line:col` line.
	 * Useful for fix recipes and context that would clutter the headline message.
	 */
	details?: string;
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
	packageName?: string;
	typescript?: boolean;
	standalone?: boolean;
	standaloneRemap?: Record<string, RemapTarget>;
	standaloneExposeNamespaces?: boolean;
	concat?: {
		js?: Array<string>;
		css?: Array<string>;
	};
	resolve?: boolean,
	cssImages?: {
		type: 'inline' | 'copy',
		maxSize: number,
		absolutePaths?: boolean,
	},
	resolveFiles?: {
		include?: string[];
		exclude?: string[];
	},
	treeshake?: boolean | TreeshakingPreset | TreeshakingOptions,
	minify?: boolean | MinifyOptions,
	sourceMaps?: boolean,
	vue?: boolean,
	transformClasses?: boolean | string[],
	babel?: boolean,
	customPlugins?: Plugin[],
	production?: boolean,
	emitDeclaration?: import('../../config/bundle/strategies/emit-declaration-strategy').EmitDeclarationConfig,
	safeNamespaces?: boolean,
	baseline?: boolean,
};

export type BuildCodeOptions = {
	code: string;
	packageRoot: string,
	publicPath: string,
	targets: string[];
	namespace: string;
	packageName?: string;
	typescript?: boolean;
	resolve?: boolean,
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
