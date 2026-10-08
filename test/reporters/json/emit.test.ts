import { spawn } from 'node:child_process';
import * as path from 'node:path';

import { describe, it } from 'mocha';
import { assert } from 'chai';

const tsxCli = path.resolve(import.meta.dirname, '../../../node_modules/tsx/dist/cli.mjs');
const script = path.resolve(import.meta.dirname, 'fixtures/emit-and-exit.ts');

describe('reporters/json/emit', () => {
	it('writes the whole payload to a pipe before the process exits', async () => {
		const stdout = await new Promise<string>((resolve, reject) => {
			const child = spawn(process.execPath, [tsxCli, script], { stdio: ['ignore', 'pipe', 'inherit'] });
			const chunks: Buffer[] = [];
			child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
			child.on('error', reject);
			child.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
		});

		assert.equal(JSON.parse(stdout).items.length, 20_000);
	});
});
