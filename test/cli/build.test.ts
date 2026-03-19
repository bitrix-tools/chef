import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { runChef, sourceRepo } from './run-chef';

function createTmpSourceRepo(): string
{
	const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-build-')));
	fs.cpSync(sourceRepo, tmp, { recursive: true });
	return tmp;
}

describe('chef build', () => {
	let tmpRepo: string;

	beforeEach(() => {
		tmpRepo = createTmpSourceRepo();
	});

	afterEach(() => {
		fs.rmSync(tmpRepo, { recursive: true, force: true });
	});

	it('should build an extension by name', async () => {
		const extensionDist = path.join(tmpRepo, 'ui/install/js/ui/buttons/dist');
		fs.rmSync(extensionDist, { recursive: true, force: true });

		const { exitCode } = await runChef(['build', 'ui.buttons'], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assert.isTrue(fs.existsSync(path.join(extensionDist, 'buttons.bundle.js')));
	});

	it('should build an extension with CSS', async () => {
		const extensionDist = path.join(tmpRepo, 'main/install/js/main/core/dist');
		fs.rmSync(extensionDist, { recursive: true, force: true });

		const { exitCode } = await runChef(['build', 'main.core'], { cwd: tmpRepo });

		assert.equal(exitCode, 0);
		assert.isTrue(fs.existsSync(path.join(extensionDist, 'core.bundle.js')));
		assert.isTrue(fs.existsSync(path.join(extensionDist, 'core.bundle.css')));
	});

	it('should report syntax error in output', async () => {
		const { output } = await runChef(['build', 'ui.syntax-error'], { cwd: tmpRepo });

		assert.include(output, 'syntax-error');
		assert.include(output, 'Unexpected token');
	});

	it('should report not found for non-existent extension', async () => {
		const { output } = await runChef(['build', 'ui.does-not-exist'], { cwd: tmpRepo });

		assert.include(output, 'not found');
	});

	it('should build by --path', async () => {
		const extensionDist = path.join(tmpRepo, 'ui/install/js/ui/buttons/dist');
		fs.rmSync(extensionDist, { recursive: true, force: true });

		const { exitCode } = await runChef(
			['build', '--path', 'ui/install/js/ui/buttons'],
			{ cwd: tmpRepo },
		);

		assert.equal(exitCode, 0);
		assert.isTrue(fs.existsSync(path.join(extensionDist, 'buttons.bundle.js')));
	});
});
