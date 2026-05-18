export interface BrowserVersions
{
	chrome?: number;
	edge?: number;
	firefox?: number;
	safari?: number;
}

export interface SupportRecord
{
	version_added?: string | boolean;
	prefix?: string;
}

export interface CompatStatus
{
	deprecated?: boolean;
	experimental?: boolean;
	standard_track?: boolean;
	baseline?: 'high' | 'low' | false;
	baseline_low_date?: string;
	baseline_high_date?: string;
}

export interface CompatEntry
{
	__compat?: {
		support?: Record<string, SupportRecord | SupportRecord[]>;
		status?: CompatStatus;
	};
}

export type BcdData = {
	javascript: {
		builtins: Record<string, any>;
		operators: Record<string, any>;
		statements: Record<string, any>;
		functions: Record<string, any>;
		classes: Record<string, any>;
	};
	css: {
		properties: Record<string, CompatEntry>;
		'at-rules': Record<string, CompatEntry & Record<string, CompatEntry>>;
		selectors: Record<string, CompatEntry>;
		types: Record<string, CompatEntry>;
	};
	api: Record<string, any>;
};

export type BaselineSeverity = 'error' | 'warning';
export type BaselineRisk = 'low' | 'medium' | 'high';

export interface BaselineWarning
{
	message: string;
	severity: BaselineSeverity;
	risk: BaselineRisk;
	unsupportedIn?: string;
	gapInfo?: string;
	line: number;
	column: number;
}

export interface RiskInfo
{
	risk: BaselineRisk;
	unsupportedIn?: string;
	gapInfo?: string;
}

/**
 * A feature usage extracted from source code. Either a JS API
 * (static method, constructor, global function, instance method)
 * or a syntax feature (optional chaining, nullish coalescing, etc.).
 */
export interface FeatureUsage
{
	kind: 'static' | 'constructor' | 'global' | 'instanceMethod' | 'syntax';

	/** Human-readable feature label, e.g. "RegExp.escape", ".at()", "?." */
	label: string;

	/** BCD lookup key components — the way to resolve compat from bcd. */
	bcdPath: string[];

	/** Display name of the owner for instance methods (e.g. "Array.prototype.at"). */
	ownerLabel?: string;

	/**
	 * For instance methods that exist on several prototypes — labels of all owners
	 * (used for the "Array.prototype.at / String.prototype.at" message).
	 */
	ownerLabels?: string[];

	line: number;
	column: number;
}
