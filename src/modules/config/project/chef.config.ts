export type DenySeverity = 'error' | 'warning';

export interface DenyRule
{
	severity?: DenySeverity;
	message?: string;
}

export type DenyOption = boolean | DenyRule;

export interface ChefConfig
{
	deny?: {
		sfc?: DenyOption;
		minification?: DenyOption;
		standalone?: DenyOption;
		resolveNodeModules?: DenyOption;
		transformClasses?: DenyOption;
		sourceMaps?: DenyOption;
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

export function parseDenyOption(option: DenyOption | undefined): { enabled: boolean; severity: DenySeverity; message?: string }
{
	if (option === undefined || option === false)
	{
		return { enabled: false, severity: 'error' };
	}

	if (option === true)
	{
		return { enabled: true, severity: 'error' };
	}

	return {
		enabled: true,
		severity: option.severity ?? 'error',
		message: option.message,
	};
}
