export type BrowserType = 'chromium' | 'firefox' | 'webkit';

export type UnitTestOptions = {
	packageName: string;
	packageRoot: string;
	projectRoot: string;
	publicPath: string;
	targets: string[];
	typescript: boolean;
	testFiles: string[];
	browserType?: BrowserType;
	headed?: boolean;
	debug?: boolean;
	grep?: string;
	file?: string;
	onToken?: (token: TestToken) => void;
};

export type E2ETestOptions = {
	projectRoot: string;
	testsDirectory: string;
	hasTests: boolean;
	headed?: boolean;
	debug?: boolean;
	grep?: string;
	project?: string | string[];
	file?: string;
};

export type TestToken = {
	id: 'SUITE_START' | 'SUITE_END' | 'TEST_PASSED' | 'TEST_FAILED' | 'TEST_PENDING';
	title?: string;
	root?: boolean;
	duration?: number;
	speed?: string;
	error?: { message: string; stack?: string };
	showDiff?: boolean;
	actual?: unknown;
	expected?: unknown;
};

export type ConsoleLog = {
	type: string;
	text: string;
};

export type TestResult = {
	report: TestToken[];
	stats: Record<string, unknown>;
	consoleLogs: ConsoleLog[];
	errors: Error[];
	debugCleanup?: (() => Promise<void>) | null;
};
