import os from 'node:os';
import PQueue from 'p-queue';

const concurrency = Math.min(4, Math.max(1, (os.availableParallelism?.() ?? os.cpus().length) - 1));

export const buildQueue = new PQueue({
	concurrency,
});
