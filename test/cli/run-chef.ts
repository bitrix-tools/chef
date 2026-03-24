import { spawn } from 'node:child_process';
import * as path from 'node:path';

type ChefResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
	output: string;
};

const chefCli = path.resolve(import.meta.dirname, '../../src/cli.ts');
const tsxBin = path.resolve(import.meta.dirname, '../../node_modules/.bin/tsx');
const fixturesPath = path.resolve(import.meta.dirname, 'fixtures');

export const sourceRepo = path.join(fixturesPath, 'source-repo');
export const projectRepo = path.join(fixturesPath, 'project-repo');

function stripAnsi(text: string): string
{
	return text.replace(/\x1B\[[0-9;]*m/g, '');
}

export function runChef(args: string[], options?: {
	cwd?: string;
	timeout?: number;
}): Promise<ChefResult>
{
	const cwd = options?.cwd ?? sourceRepo;
	const timeout = options?.timeout ?? 30_000;

	return new Promise((resolve) => {
		const child = spawn(tsxBin, [chefCli, ...args], {
			cwd,
			env: {
				...process.env,
				NO_COLOR: '1',
			},
			timeout,
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (data: Buffer) => {
			stdout += data.toString();
		});

		child.stderr.on('data', (data: Buffer) => {
			stderr += data.toString();
		});

		child.on('close', (code) => {
			resolve({
				stdout,
				stderr,
				exitCode: code ?? 1,
				output: stripAnsi(stdout),
			});
		});

		child.on('error', () => {
			resolve({
				stdout,
				stderr,
				exitCode: 1,
				output: stripAnsi(stdout),
			});
		});
	});
}
