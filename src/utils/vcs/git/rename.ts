import { spawnSync } from 'child_process';

import { Environment } from '../../../environment/environment';

type RenameResult = {
	status: 'ok' | 'fail',
	stderr: string,
};

export async function gitRename(oldPath: string, newPath: string): Promise<RenameResult>
{
	const cwd = Environment.getRoot();

	const gitProcess = spawnSync(
		'git',
		['mv', oldPath, newPath],
		{
			cwd,
			stdio: 'pipe',
			shell: process.platform === 'win32',
		},
	);

	if (gitProcess.error)
	{
		return { status: 'fail', stderr: gitProcess.error.message };
	}

	const stderr = gitProcess.stderr?.toString('utf-8') ?? '';

	return {
		status: stderr.length === 0 ? 'ok' : 'fail',
		stderr,
	};
}
