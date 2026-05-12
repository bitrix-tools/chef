import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SIGNAL_DIR = path.join(os.tmpdir(), 'chef-debug-signal');
const READY_FILE = 'ready';
const RUN_FILE = 'run';
const POLL_INTERVAL = 100;

export function signalReady(cdpPort: number, signalDir: string = SIGNAL_DIR): { readyFile: string; runFile: string }
{
	fs.mkdirSync(signalDir, { recursive: true });

	const readyFile = path.join(signalDir, READY_FILE);
	const runFile = path.join(signalDir, RUN_FILE);

	try { fs.unlinkSync(readyFile); } catch {}
	try { fs.unlinkSync(runFile); } catch {}

	fs.writeFileSync(readyFile, String(cdpPort));

	return { readyFile, runFile };
}

export async function waitForDebugger(signalDir: string = SIGNAL_DIR): Promise<void>
{
	const readyFile = path.join(signalDir, READY_FILE);
	const runFile = path.join(signalDir, RUN_FILE);

	return new Promise<void>((resolve) => {
		const check = () => {
			if (fs.existsSync(runFile))
			{
				try { fs.unlinkSync(readyFile); } catch {}
				try { fs.unlinkSync(runFile); } catch {}
				resolve();
				return;
			}
			setTimeout(check, POLL_INTERVAL);
		};
		check();
	});
}
