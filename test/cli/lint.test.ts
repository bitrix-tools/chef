import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { runChef, sourceRepo } from './run-chef';

describe('chef lint', () => {
	let tmpRepo: string;

	beforeEach(() => {
		tmpRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-lint-')));
		fs.cpSync(sourceRepo, tmpRepo, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpRepo, { recursive: true, force: true });
	});

	it('should skip lint when no eslint config is found', async () => {
		const { exitCode, output } = await runChef(['lint', 'ui.buttons'], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assert.include(output, 'No matching lint strategy');
	});

	it('should lint with eslint config', async () => {
		// Create a minimal eslint config that reports unused variables
		fs.writeFileSync(path.join(tmpRepo, 'eslint.config.mjs'), `
export default [
	{
		rules: {
			'no-unused-vars': 'error',
		},
	},
];
`);

		const { exitCode } = await runChef(['lint', 'ui.lint-errors'], { cwd: tmpRepo });

		assert.equal(exitCode, 1);
	});
});
