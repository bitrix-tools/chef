import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { runChef, sourceRepo } from './run-chef';

function createTmpSourceRepo(): string
{
	const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-cli-json-')));
	fs.cpSync(sourceRepo, tmp, { recursive: true });
	return tmp;
}

describe('CLI --reporter json', () => {
	describe('chef build --reporter json', () => {
		let tmpRepo: string;

		beforeEach(() => {
			tmpRepo = createTmpSourceRepo();
		});

		afterEach(() => {
			fs.rmSync(tmpRepo, { recursive: true, force: true });
		});

		it('emits valid JSON to stdout for a successful build', async () => {
			const { stdout, exitCode } = await runChef(
				['build', 'ui.ts-valid', '--reporter', 'json'],
				{ cwd: tmpRepo, timeout: 60_000 },
			);

			assert.equal(exitCode, 0);
			const parsed = JSON.parse(stdout);
			assert.isTrue(parsed.success);
			assert.equal(parsed.command, 'build');
			assert.lengthOf(parsed.extensions, 1);
			assert.equal(parsed.extensions[0].name, 'ui.ts-valid');
		});

		it('returns success and empty extensions when extension not found', async () => {
			const { stdout, exitCode } = await runChef(
				['build', 'definitely.nope', '--reporter', 'json'],
				{ cwd: tmpRepo },
			);

			assert.equal(exitCode, 0);
			const parsed = JSON.parse(stdout);
			assert.isTrue(parsed.success);
			assert.lengthOf(parsed.extensions, 0);
		});

		it('exits with 2 when --watch combined with --reporter json', async () => {
			const { stdout, exitCode } = await runChef(
				['build', 'ui.buttons', '--watch', '--reporter', 'json'],
				{ cwd: tmpRepo },
			);

			assert.equal(exitCode, 2);
			const parsed = JSON.parse(stdout);
			assert.isFalse(parsed.success);
			assert.isDefined(parsed.error);
			assert.include(parsed.error.message, '--watch');
		});
	});

	describe('chef lint --reporter json', () => {
		it('emits JSON with success and empty extensions for missing extension', async () => {
			const { stdout, exitCode } = await runChef(
				['lint', 'definitely.nope', '--reporter', 'json'],
				{ cwd: sourceRepo },
			);

			assert.equal(exitCode, 0);
			const parsed = JSON.parse(stdout);
			assert.equal(parsed.command, 'lint');
			assert.isTrue(parsed.success);
			assert.lengthOf(parsed.extensions, 0);
		});
	});

	describe('chef diag top-used --reporter json', () => {
		it('emits ChefDataResult with { scanned, results }', async () => {
			const { stdout, exitCode } = await runChef(
				['diag', 'top-used', '--limit', '5', '--reporter', 'json'],
				{ cwd: sourceRepo, timeout: 60_000 },
			);

			assert.equal(exitCode, 0);
			const parsed = JSON.parse(stdout);
			assert.isTrue(parsed.success);
			assert.equal(parsed.command, 'diag.top-used');
			assert.isObject(parsed.data);
			assert.isNumber(parsed.data.scanned);
			assert.isArray(parsed.data.results);
		});
	});
});
