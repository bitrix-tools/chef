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

	it('should lint with oxlint and the Bitrix24 presets by default', async () => {
		const { exitCode, output } = await runChef(['lint', 'ui.lint-errors'], { cwd: tmpRepo });

		assert.equal(exitCode, 1);
		assert.include(output, path.join('src', 'legacy.js'));
	});

	it('should exclude files with --exclude exact path', async () => {
		const { output } = await runChef(
			['lint', 'ui.lint-errors', '--exclude', 'src/legacy.js'],
			{ cwd: tmpRepo },
		);

		assert.notInclude(output, 'legacy.js');
		assert.include(output, 'index.js');
	});

	it('should exclude files with --exclude glob pattern', async () => {
		const { exitCode, output } = await runChef(
			['lint', 'ui.lint-errors', '--exclude', 'src/*.js'],
			{ cwd: tmpRepo },
		);

		assert.equal(exitCode, 0);
		assert.notInclude(output, 'index.js');
		assert.notInclude(output, 'legacy.js');
	});
});
