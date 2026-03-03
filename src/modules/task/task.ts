import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export interface TaskContext
{
	update(message: string): void;
	log(message: string): void;
	succeed(message: string): void;
	fail(message: string): void;
	warn(message: string): void;
	border(text: string, color?: string, indentBeforeBorder?: number): void;
	readonly previousResult?: any;
}

export interface Task
{
	title: string;
	run(ctx: TaskContext, result?: any): Promise<any>;
	subtasks?: Task[];
}

type TaskContextOptions = {
	spinner: Ora;
	taskTitle: string;
	indent?: string;
	getPreviousResult?: () => any;
};

type TaskContextState = {
	isFinished: boolean;
};

function createTaskContext(options: TaskContextOptions, state: TaskContextState): TaskContext
{
	const { spinner, taskTitle, indent = '', getPreviousResult } = options;

	return {
		get previousResult() {
			return getPreviousResult?.();
		},
		update: (message: string) => {
			if (!state.isFinished)
			{
				spinner.text = message;
			}
		},
		log: (message: string) => {
			if (indent)
			{
				const indentedMessage = message
					.split('\n')
					.map(line => `${indent}${line}`)
					.join('\n');
				console.log(indentedMessage);
			}
			else
			{
				console.log(message);
			}
		},
		succeed: (message: string) => {
			if (!state.isFinished)
			{
				state.isFinished = true;
				spinner.succeed(message || taskTitle);
			}
		},
		fail: (message: string) => {
			if (!state.isFinished)
			{
				state.isFinished = true;
				spinner.fail(message || taskTitle);
			}
		},
		warn: (message: string) => {
			if (!state.isFinished)
			{
				state.isFinished = true;
				spinner.warn(message);
			}
		},
		border: (text: string, color?: string, indentBeforeBorder: number = 0) => {
			const colorFn = color && typeof chalk[color as keyof typeof chalk] === 'function'
				? (chalk as any)[color]
				: (str: string) => str;

			const beforeBorderIndent = ' '.repeat(indentBeforeBorder);

			const lines = text.split('\n');
			const borderedLines = lines.map((line) => {
				const border = indent ? colorFn(`${beforeBorderIndent}| `) : chalk.bold(colorFn(`${beforeBorderIndent}| `));
				return border + line;
			});

			if (indent)
			{
				const indentedBorderedLines = borderedLines.map(line => `${indent}${line}`);
				console.log(indentedBorderedLines.join('\n'));
			}
			else
			{
				console.log(borderedLines.join('\n'));
			}
		},
	};
}

function handleTaskError(error: any, taskTitle: string, state: TaskContextState, spinner: Ora, indent: string = ''): void
{
	if (!state.isFinished)
	{
		state.isFinished = true;
		spinner.fail(taskTitle);
	}

	const errorMessage = error.message || 'Unknown error';
	const indentedMessage = errorMessage
		.split('\n')
		.map((line: string) => {
			return `${indent}  ${chalk.red(`Error: ${line}`)}`;
		})
		.join('\n');
	console.log(indentedMessage);

	if (error.stack)
	{
		const stackMessage = error.stack
			.split('\n')
			.map((line: string) => {
				return `${indent}  ${chalk.red(`Stack: ${line}`)}`;
			})
			.join('\n');
		console.log(stackMessage);
	}
}

export class TaskRunner
{
	static async runTask(task: Task, title?: string): Promise<any>
	{
		return this.executeTasks([task], 0, undefined, title);
	}

	static async run(tasks: Task[], options: { indent?: number } = {}): Promise<any>
	{
		const indentLevel = options.indent ?? 0;
		return this.executeTasks(tasks, indentLevel, undefined);
	}

	private static async executeTasks(
		tasks: Task[],
		depth: number,
		initialResult?: any,
		overrideTitle?: string
	): Promise<any>
	{
		const indent = '  '.repeat(depth);
		let previousResult: any = initialResult;

		for (const task of tasks)
		{
			const taskTitle = overrideTitle || task.title;
			const spinner = ora({
				text: taskTitle,
				spinner: 'dots',
				prefixText: indent || undefined,
			});
			spinner.start();

			const state: TaskContextState = { isFinished: false };

			const context = createTaskContext(
				{
					spinner,
					taskTitle,
					indent,
					getPreviousResult: () => previousResult,
				},
				state,
			);

			try
			{
				const result = await task.run(context, previousResult);
				previousResult = result;

				if (!state.isFinished)
				{
					spinner.succeed(taskTitle);
				}
			}
			catch (error: any)
			{
				handleTaskError(error, taskTitle, state, spinner, indent);
				throw error;
			}

			if (task.subtasks && task.subtasks.length > 0)
			{
				previousResult = await this.executeTasks(task.subtasks, depth + 1, previousResult);
			}
		}

		return previousResult;
	}
}