import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { runChef, sourceRepo } from './run-chef';

describe('chef aliases', () => {
	let tmpRepo: string;

	beforeEach(() => {
		tmpRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-aliases-')));
		fs.cpSync(sourceRepo, tmpRepo, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpRepo, { recursive: true, force: true });
	});

	it('should generate aliases.tsconfig.json', async () => {
		const { exitCode, output } = await runChef(
			['aliases'],
			{ cwd: tmpRepo },
		);

		assert.equal(exitCode, 0);
		assert.isTrue(fs.existsSync(path.join(tmpRepo, 'aliases.tsconfig.json')));
		assert.include(output, 'aliases');
	});

	it('should output single line in quiet mode', async () => {
		const { exitCode, output } = await runChef(
			['aliases', '-q'],
			{ cwd: tmpRepo },
		);

		assert.equal(exitCode, 0);
		const lines = output.trim().split('\n');
		assert.equal(lines.length, 1);
		assert.include(output, 'aliases.tsconfig.json');
	});
});
