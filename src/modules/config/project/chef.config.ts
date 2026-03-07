export interface ChefConfig
{
	deny?: {
		sfc?: boolean;
		minification?: boolean;
		standalone?: boolean;
		resolveNodeModules?: boolean;
		transformClasses?: boolean;
		sourceMaps?: boolean;
	};
	defaults?: {
		targets?: string | string[];
		sourceMaps?: boolean;
		treeshake?: boolean;
	};
	enforce?: {
		targets?: string | string[];
		sourceMaps?: boolean;
		treeshake?: boolean;
		babel?: boolean;
	};
}

export const denyLabels: Record<string, string> = {
	sfc: 'Vue Single File Components (SFC)',
	minification: 'Minification',
	standalone: 'Standalone mode',
	resolveNodeModules: 'Resolving node_modules',
	transformClasses: 'Class transformation',
	sourceMaps: 'Source maps',
};
