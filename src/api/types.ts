import type { DiagnosticCode } from '../diagnostics/diagnostic-codes';

export type ChefErrorPayload = {
	code: DiagnosticCode | string,
	message: string,
	file?: string,
	line?: number,
	column?: number,
};

export type ChefNotFoundEntry = {
	name: string,
	code: DiagnosticCode | string,
	reason: string,
};

/**
 * Common summary fields shared across all bulk operations. The numbers count
 * extensions, not individual tests/errors/etc — for those, see command-specific
 * summary extras (e.g. `summary.tests`, `summary.lint`).
 */
export type ChefSummary = {
	total: number,
	passed: number,
	failed: number,
	durationMs: number,
};

export type ChefExtensionResult<TDetails = unknown> = {
	name: string,
	path: string,
	ok: boolean,
	durationMs: number,
	details?: TDetails,
	error?: ChefErrorPayload,
	warnings?: ChefErrorPayload[],
};

export type ChefResult<TDetails = unknown, TSummaryExtras = {}> = {
	ok: boolean,
	command: string,
	extensions: ChefExtensionResult<TDetails>[],
	notFound: ChefNotFoundEntry[],
	error?: ChefErrorPayload,
	summary: ChefSummary & TSummaryExtras,
};

export type ChefDataResult<TData> = {
	ok: boolean,
	command: string,
	data?: TData,
	error?: ChefErrorPayload,
	durationMs: number,
};

export type BaseApiOptions = {
	cwd?: string,
};
