import { constants } from 'node:os';

// Exit code of a process stopped by a signal: 128 + the signal number (130 for Ctrl+C).
export function createShutdown(action: () => any): (signal: NodeJS.Signals) => Promise<any>
{
	let isShuttingDown = false;

	return async (signal: NodeJS.Signals) => {
		if (isShuttingDown)
		{
			return;
		}

		isShuttingDown = true;

		await action();

		process.exit(128 + constants.signals[signal]);
	};
}
