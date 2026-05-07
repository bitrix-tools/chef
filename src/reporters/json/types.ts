import type { DiagnosticCode } from '../../diagnostics/diagnostic-codes';

export type JsonErrorPayload = {
	code: DiagnosticCode | string,
	message: string,
	file?: string,
	line?: number,
	column?: number,
	/** Code frame from the source — populated where the engine has it (typecheck/build). */
	frame?: string,
};

/**
 * Common summary fields shared across all bulk operations. The numbers count
 * extensions, not individual tests/etc — for those, see command-specific
 * summary extras (e.g. `summary.tests`).
 *
 * `errorCount` / `warningCount` aggregate errors/warnings across all extensions.
 */
export type JsonSummary = {
	total: number,
	passed: number,
	failed: number,
	durationMs: number,
	errorCount: number,
	warningCount: number,
};

export type JsonExtensionResult<TDetails = unknown> = {
	name: string,
	path: string,
	success: boolean,
	durationMs: number,
	details: TDetails,
	errors: JsonErrorPayload[],
	warnings: JsonErrorPayload[],
};

export type JsonNotFoundEntry = {
	name: string,
	reason: string,
};

export type JsonMeta = {
	chefVersion: string,
	cwd: string,
};

export type JsonOperationResult<TDetails = unknown, TSummaryExtras = {}> = JsonMeta & {
	success: boolean,
	command: string,
	extensions: JsonExtensionResult<TDetails>[],
	notFound: JsonNotFoundEntry[],
	summary: JsonSummary & TSummaryExtras,
	/** Present only on catastrophic failures (env/config parsing). Empty on regular results. */
	error?: JsonErrorPayload,
};

export type JsonReportResult<TData> = JsonMeta & {
	success: boolean,
	command: string,
	data: TData,
	durationMs: number,
	/** Present only on catastrophic failures. Empty on regular results. */
	error?: JsonErrorPayload,
};

export type JsonInputOptions = {
	cwd?: string,
};
