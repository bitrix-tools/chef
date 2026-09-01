export type BrowserType = 'chromium' | 'firefox' | 'webkit';

export type TestAttachment = {
	name: string;
	contentType: string;
	// Filesystem path to the artifact (screenshot / video / trace). Always present here —
	// inline (body-only) attachments are dropped upstream since they have no path.
	path: string;
};

/**
 * Groups per-test attachments by browser, preserving first-seen order, so a failure's
 * artifacts can be printed as one block per engine (Chromium/Firefox/WebKit).
 */
export function groupAttachmentsByBrowser<T extends { browser?: string }>(
	attachments: T[],
): Array<[string | undefined, T[]]>
{
	const groups = new Map<string | undefined, T[]>();

	for (const attachment of attachments)
	{
		const existing = groups.get(attachment.browser);
		if (existing)
		{
			existing.push(attachment);
		}
		else
		{
			groups.set(attachment.browser, [attachment]);
		}
	}

	return [...groups.entries()];
}

export type TestToken = {
	id: 'SUITE_START' | 'SUITE_END' | 'TEST_PASSED' | 'TEST_FAILED' | 'TEST_PENDING' | 'TEST_LISTED';
	title?: string;
	suite?: string[];
	root?: boolean;
	duration?: number;
	speed?: string;
	error?: { message: string; stack?: string };
	attachments?: TestAttachment[];
	// Source location, populated only for TEST_LISTED (--list). e2e gets it from Playwright's
	// test.location; unit has no source mapping in the browser, so it stays absent there.
	file?: string;
	line?: number;
	// TEST_LISTED only: the test is skipped (test.skip/fixme / it.skip) — shown as skipped
	// in the listing rather than as a regular pending run.
	pending?: boolean;
	showDiff?: boolean;
	actual?: unknown;
	expected?: unknown;
	// Number of retries the test went through before this (final) result — i.e. Playwright's
	// `result.retry` on the last attempt. 0 or absent means it ran once. A passed test with
	// retries > 0 is flaky (failed, then passed); a failed one exhausted its retries.
	retries?: number;
	/**
	 * Browser the test ran in. Populated by the strategy that produced the
	 * token: e2e — from Playwright project name, unit — from the launched
	 * BrowserType. Absent when not applicable (e.g. SUITE_START tokens).
	 */
	browser?: string;
};

// --list result: how many unique tests were enumerated, split into ones that would run and
// ones that are skipped. Each test kind (unit / e2e) reports its own counts; the command
// layer merges them into a single Summary block across kinds.
export type ListingCounts = {
	total: number;
	runnable: number;
	skipped: number;
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
	// List tests (emit TEST_LISTED) instead of running them (--list).
	listOnly?: boolean;
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
	// Collect the Node-side stdout of the test process (see TestResult.nodeOutput).
	captureNodeOutput?: boolean;
	// List tests (emit TEST_LISTED) instead of running them (--list).
	listOnly?: boolean;
	// Raw arguments the user put after `--`, forwarded to Playwright as-is.
	runnerArgs?: string[];
	onToken?: (token: TestToken, browser?: string) => void;
	onStatus?: (status: string) => void;
	onBegin?: (info: { totalTests: number; browserCount: number; browsers?: string[] }) => void;
};

export type ConsoleLog = {
	type: string;
	text: string;
};

export type NodeOutputSection = {
	browser?: string;
	// One entry per captured stdout/stderr write (i.e. per console.* call), kept separate
	// so the reporter can delimit each message rather than merging them into one blob.
	messages: string[];
};

export type TestResult = {
	report: TestToken[];
	stats: Record<string, unknown>;
	consoleLogs: ConsoleLog[];
	errors: Error[];
	// Raw Node-side stdout of the test process (e2e specs run in Node, not the browser).
	// One entry per browser project run (browser is undefined for a single, unlabeled run).
	// Collected only when console output is requested, and printed verbatim so a spec's
	// `console.log` is visible on green runs — grouped per browser like a real console.
	nodeOutput?: NodeOutputSection[];
	debugCleanup?: (() => Promise<void>) | null;
};
