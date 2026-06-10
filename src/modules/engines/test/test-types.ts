export type BrowserType = 'chromium' | 'firefox' | 'webkit';

export type TestToken = {
	id: 'SUITE_START' | 'SUITE_END' | 'TEST_PASSED' | 'TEST_FAILED' | 'TEST_PENDING';
	title?: string;
	suite?: string[];
	root?: boolean;
	duration?: number;
	speed?: string;
	error?: { message: string; stack?: string };
	showDiff?: boolean;
	actual?: unknown;
	expected?: unknown;
	/**
	 * Browser the test ran in. Populated by the strategy that produced the
	 * token: e2e — from Playwright project name, unit — from the launched
	 * BrowserType. Absent when not applicable (e.g. SUITE_START tokens).
	 */
	browser?: string;
};

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
	cdpPort?: number;
	onToken?: (token: TestToken, browser?: string) => void;
	onStatus?: (status: string) => void;
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
	onToken?: (token: TestToken, browser?: string) => void;
	onStatus?: (status: string) => void;
	onBegin?: (info: { totalTests: number; browserCount: number; browsers?: string[] }) => void;
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
