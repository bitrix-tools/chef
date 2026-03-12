type TaskStatus = 'passed' | 'failed' | 'warning';

type TaskDetail =
	| { type: 'item'; text: string }
	| { type: 'block'; text: string; color?: string }
	| { type: 'error'; code?: string; message: string; stack?: string; frame?: string; loc?: { file: string; line: number; column: number; root?: string } };

interface TaskResult
{
	title: string;
	status: TaskStatus;
	details?: TaskDetail[];
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
}

interface TaskGroupResult
{
	title: string;
	results: TaskResult[];
	passed: number;
	failed: number;
	warnings: number;
	duration: number;
}

export type {
	TaskStatus,
	TaskDetail,
	TaskResult,
	Task,
	TaskGroup,
	TaskGroupResult,
};
