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

describe('CLI --json', () => {
	describe('chef build --json', () => {
		let tmpRepo: string;

		beforeEach(() => {
			tmpRepo = createTmpSourceRepo();
		});

		afterEach(() => {
			fs.rmSync(tmpRepo, { recursive: true, force: true });
		});

		it('emits valid JSON to stdout for a successful build', async () => {
			const { stdout, exitCode } = await runChef(
				['build', 'ui.ts-valid', '--json'],
				{ cwd: tmpRepo, timeout: 60_000 },
			);

			assert.equal(exitCode, 0);
			const parsed = JSON.parse(stdout);
			assert.isTrue(parsed.ok);
			assert.equal(parsed.command, 'build');
			assert.lengthOf(parsed.extensions, 1);
			assert.equal(parsed.extensions[0].name, 'ui.ts-valid');
		});

		it('exits with 1 and emits JSON when extension not found', async () => {
			const { stdout, exitCode } = await runChef(
				['build', 'definitely.nope', '--json'],
				{ cwd: tmpRepo },
			);

			assert.equal(exitCode, 1);
			const parsed = JSON.parse(stdout);
			assert.isFalse(parsed.ok);
			assert.lengthOf(parsed.notFound, 1);
		});

		it('exits with 2 when --watch combined with --json', async () => {
			const { stdout, exitCode } = await runChef(
				['build', 'ui.buttons', '--watch', '--json'],
				{ cwd: tmpRepo },
			);

			assert.equal(exitCode, 2);
			const parsed = JSON.parse(stdout);
			assert.isFalse(parsed.ok);
			assert.isDefined(parsed.error);
			assert.include(parsed.error.message, '--watch');
		});
	});

	describe('chef lint --json', () => {
		it('emits JSON with notFound for missing extension', async () => {
			const { stdout, exitCode } = await runChef(
				['lint', 'definitely.nope', '--json'],
				{ cwd: sourceRepo },
			);

			assert.equal(exitCode, 1);
			const parsed = JSON.parse(stdout);
			assert.equal(parsed.command, 'lint');
			assert.isFalse(parsed.ok);
			assert.lengthOf(parsed.notFound, 1);
		});
	});

	describe('chef diag top-used --json', () => {
		it('emits ChefDataResult with array data', async () => {
			const { stdout, exitCode } = await runChef(
				['diag', 'top-used', '--limit', '5', '--json'],
				{ cwd: sourceRepo, timeout: 60_000 },
			);

			assert.equal(exitCode, 0);
			const parsed = JSON.parse(stdout);
			assert.isTrue(parsed.ok);
			assert.equal(parsed.command, 'diag.top-used');
			assert.isArray(parsed.data);
		});
	});
});
