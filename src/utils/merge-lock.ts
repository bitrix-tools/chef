import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const LOCK_DIR = '.chef';
const LOCK_FILE = 'merge.lock';

export class MergeLock
{
	readonly #lockPath: string;

	constructor(rootPath: string)
	{
		this.#lockPath = path.join(rootPath, LOCK_DIR, LOCK_FILE);
	}

	async acquire(): Promise<void>
	{
		await fs.mkdir(path.dirname(this.#lockPath), { recursive: true });
		await fs.writeFile(this.#lockPath, String(process.pid));
	}

	async release(): Promise<void>
	{
		try
		{
			await fs.unlink(this.#lockPath);
		}
		catch
		{
			// Already removed — not an error
		}
	}

	async isLocked(): Promise<boolean>
	{
		try
		{
			await fs.access(this.#lockPath);
			return true;
		}
		catch
		{
			return false;
		}
	}

	get path(): string
	{
		return this.#lockPath;
	}
}
