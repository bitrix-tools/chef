import type { RollupLog } from 'rollup';

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
	targets: string[];
	namespace: string;
	typescript?: boolean;
	standalone?: boolean;
	concat?: {
		js?: Array<string>;
		css?: Array<string>;
	};
	resolve?: boolean,
};

export type BuildCodeOptions = {
	code: string;
	targets: string[];
	namespace: string;
	typescript?: boolean;
	resolve?: boolean,
	standalone?: boolean;
};

export interface BuildCodeResult {
	warnings: RollupLog[];
	errors: RollupLog[];
	code: string;
	dependencies: string[];
}
