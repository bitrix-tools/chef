import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { runChef, sourceRepo } from '../cli/run-chef';

// On Windows process.cwd() and command-line --path may differ in drive-letter
// case (C:\foo vs c:\foo). cli.ts:67 uses cwd.startsWith(root), a
// case-sensitive comparison, so chef would refuse to run with OUTSIDE_PROJECT_ROOT.
// Even on macOS, the file system is case-insensitive by default and users can
// pass a project path with different case from the canonical form. The check
// must compare paths case-insensitively on case-insensitive file systems.

describe('chef CLI — case-insensitive project root check', () => {
	let tmpRepo: string;

	beforeEach(() => {
		tmpRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-cwd-case-')));
		fs.cpSync(sourceRepo, tmpRepo, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpRepo, { recursive: true, force: true });
	});

	it('accepts --path with an alternate-case prefix on case-insensitive FS', async function () {
		// On case-insensitive file systems (macOS default, Windows) chef must
		// accept differently-cased paths that point at the same directory.
		// On case-sensitive Linux this assumption does not hold, so we skip.
		if (process.platform === 'linux')
		{
			this.skip();
		}

		// Take the canonical tmpRepo and uppercase a middle segment of its
		// basename. The path still resolves to the same directory on
		// case-insensitive systems.
		const altCase = path.join(path.dirname(tmpRepo), path.basename(tmpRepo).toUpperCase());

		const { exitCode, output, stderr } = await runChef(
			['aliases', '--path', altCase],
			{ cwd: tmpRepo },
		);

		assert.equal(exitCode, 0, `chef must accept the alt-case path. stderr=${stderr} output=${output}`);
	});
});
