export type LintOptions = {
	sourcePath: string;
	rootPath: string;
	fix?: boolean;
	files?: string[];
	cache?: boolean;
};

export type LintFormatterLevel = 'succeed' | 'warn' | 'fail';

export interface LintMessage {
	line: number;
	column: number;
	severity: 'error' | 'warning';
	message: string;
	ruleId: string | null;
}

export interface LintFileResult {
	filePath: string;
	messages: LintMessage[];
}

export interface LintResult {
	files: LintFileResult[];
	skipped?: boolean;
	skipReason?: string;
	hasErrors(): boolean;
	getErrorsCount(): number;
	hasWarnings(): boolean;
	getWarningsCount(): number;
}
