export type LintOptions = {
	sourcePath: string;
	rootPath: string;
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
	hasErrors(): boolean;
	getErrorsCount(): number;
	hasWarnings(): boolean;
	getWarningsCount(): number;
}
