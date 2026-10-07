export type LinterName = 'eslint' | 'oxlint';

export type LintOptions = {
	sourcePath: string;
	rootPath: string;
	fix?: boolean;
	files?: string[];
	cache?: boolean;
	exclude?: string[];
	// forces a linter; by default oxlint is used when the project has an oxlint config,
	// ESLint otherwise. The CHEF_LINTER environment variable does the same.
	linter?: LinterName;
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
	getFixedCount(): number;
}
