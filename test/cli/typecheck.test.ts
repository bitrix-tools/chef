import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { runChef, sourceRepo } from './run-chef';

describe('chef typecheck', () => {
	let tmpRepo: string;

	beforeEach(() => {
		tmpRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-typecheck-')));
		fs.cpSync(sourceRepo, tmpRepo, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpRepo, { recursive: true, force: true });
	});

	it('should pass for valid TypeScript extension', async () => {
		const { exitCode, output } = await runChef(['typecheck', 'ui.ts-valid'], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assert.include(output, 'ui.ts-valid');
	});

	it('should report type errors', async () => {
		const { exitCode, output } = await runChef(['typecheck', 'ui.ts-errors'], { cwd: tmpRepo });

		assert.equal(exitCode, 1);
		assert.include(output, 'CF1001');
		assert.include(output, 'TS2322');
	});

	it('should skip non-TypeScript extensions', async () => {
		const { exitCode, output } = await runChef(['typecheck', 'ui.buttons'], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assert.include(output, 'Not a TypeScript extension');
	});

	it('should check specific file with --file', async () => {
		const { exitCode, output } = await runChef(
			['typecheck', 'ui.ts-errors', '--file', 'src/helper.ts'],
			{ cwd: tmpRepo },
		);

		assert.equal(exitCode, 0);
		assert.notInclude(output, 'CF1001');
	});

	it('should report errors only for specified file', async () => {
		const { exitCode, output } = await runChef(
			['typecheck', 'ui.ts-errors', '--file', 'src/index.ts'],
			{ cwd: tmpRepo },
		);

		assert.equal(exitCode, 1);
		assert.include(output, 'CF1001');
		assert.include(output, 'TS2322');
	});

	it('should report not found for non-existent file', async () => {
		const { exitCode, output } = await runChef(
			['typecheck', 'ui.ts-valid', '--file', 'src/nonexistent.ts'],
			{ cwd: tmpRepo },
		);

		assert.equal(exitCode, 1);
		assert.include(output, 'CF2005');
		assert.include(output, 'File not found');
	});

	it('should report not found for non-existent extension', async () => {
		const { output } = await runChef(['typecheck', 'ui.does-not-exist'], { cwd: tmpRepo });

		assert.include(output, 'not found');
	});

	it('should check by --path', async () => {
		const { exitCode, output } = await runChef(
			['typecheck', '--path', 'ui/install/js/ui/ts-valid'],
			{ cwd: tmpRepo },
		);

		assert.equal(exitCode, 0);
		assert.include(output, 'ui.ts-valid');
	});
});
