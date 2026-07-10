type TaskStatus = 'passed' | 'failed' | 'warning' | 'skipped';

type TaskDetail =
	| { type: 'item'; text: string }
	| { type: 'block'; text: string; color?: string }
	| { type: 'error'; severity?: 'error' | 'warning'; code?: string; message: string; details?: string; stack?: string; frame?: string; loc?: { file: string; line: number; column: number; root?: string }; risk?: string; gapInfo?: string };

type TaskFailure = {
	suitePath: string;
	title: string;
	browsers: string[];
	error?: { message: string; stack?: string };
	// Per-test artifacts (screenshot / video / trace) with the browser they came from.
	attachments?: Array<{ name: string; contentType: string; path: string; browser?: string }>;
	showDiff?: boolean;
	actual?: unknown;
	expected?: unknown;
};

interface TaskResult
{
	title: string;
	status: TaskStatus;
	details?: TaskDetail[];
	metrics?: {
		passed?: number;
		failed?: number;
		failures?: TaskFailure[];
		browsers?: Array<{ name: string; passed: number; failed: number }>;
		// Tests that passed or failed only after being retried (flaky). Shown in the summary.
		flaky?: number;
		// --list only: enumerated-test counts for the combined Summary block.
		listing?: { kind: 'unit' | 'e2e'; total: number; runnable: number; skipped: number };
	};
}

interface Task
{
	title: string;
	run(onUpdate?: (message: string) => void): Promise<TaskResult>;
}

interface TaskGroup
{
	title: string;
	tasks: Task[];
	showSummary?: boolean;
	suppressErrorDetails?: boolean;
}

interface TaskGroupResult
{
	title: string;
	results: TaskResult[];
	passed: number;
	failed: number;
	warnings: number;
	skipped: number;
	duration: number;
}

export type {
	TaskStatus,
	TaskDetail,
	TaskFailure,
	TaskResult,
	Task,
	TaskGroup,
	TaskGroupResult,
};
