import * as path from 'node:path';

import { describe, it } from 'mocha';
import { assert } from 'chai';

import { runChef, sourceRepo, projectRepo } from './run-chef';

/**
 * `chef test module` runs module-level scenario e2e tests from
 * `<module>/tests/chef/e2e/`. These tests cover the parts that do not need a
 * real browser/portal: module resolution, the cwd fallback and the "no tests"
 * reporting (which must surface as skipped, not a green pass).
 */
describe('chef test module', () => {
	it('reports a module without tests as skipped, not passed', async () => {
		const { exitCode, output } = await runChef(['test', 'module', 'crm'], { cwd: sourceRepo });

		assert.equal(exitCode, 0);
		assert.include(output, 'no test files');
		assert.include(output, '1 skipped');
		assert.notInclude(output, '1 passed');
	});

	it('labels the summary as Modules (not Extensions)', async () => {
		const { output } = await runChef(['test', 'module', 'crm'], { cwd: sourceRepo });

		assert.include(output, 'Modules');
		assert.notInclude(output, 'Extensions');
	});

	it('defaults to the module of the current working directory', async () => {
		// Run from inside the crm module with no module argument.
		const { exitCode, output } = await runChef(['test', 'module'], {
			cwd: path.join(sourceRepo, 'crm'),
		});

		assert.equal(exitCode, 0);
		assert.include(output, 'no test files');
		assert.include(output, '1 skipped');
	});

	it('errors with a hint when no module is given and cwd is the project root', async () => {
		const { exitCode, output } = await runChef(['test', 'module'], { cwd: sourceRepo });

		assert.equal(exitCode, 1);
		assert.include(output, 'Specify a module');
	});

	it('runs several modules in one invocation', async () => {
		const { exitCode, output } = await runChef(['test', 'module', 'crm', 'main'], { cwd: sourceRepo });

		assert.equal(exitCode, 0);
		// Both modules have no tests, so the summary aggregates two skips.
		assert.include(output, '2 skipped');
	});

	it('supports the json reporter, emitting the same shape as extension tests', async () => {
		const { exitCode, output } = await runChef(['test', 'module', 'crm', '--reporter', 'json'], { cwd: sourceRepo });

		// crm has no test files → a clean, successful JSON result (not an error/exit 2).
		assert.equal(exitCode, 0);
		const json = JSON.parse(output);
		assert.equal(json.command, 'test');
		assert.isTrue(json.success);
		assert.lengthOf(json.extensions, 1);
		assert.equal(json.extensions[0].name, 'crm');
		// Modules run e2e only — unit is always an empty, skipped kind.
		assert.equal(json.extensions[0].details.unit.skipReason, 'modules have no unit tests');
		assert.equal(json.extensions[0].details.e2e.skipReason, 'no e2e tests');
	});

	it('works on an installed Bitrix (project), resolving modules under local/', async () => {
		// projectRepo has no local/modules/mymod, so there are no test files —
		// the run must still complete cleanly and report the module as skipped
		// (i.e. the path resolved to local/modules, not the project root).
		const { exitCode, output } = await runChef(['test', 'module', 'mymod'], { cwd: projectRepo });

		assert.equal(exitCode, 0);
		assert.include(output, 'no test files');
		assert.include(output, '1 skipped');
		assert.include(output, 'Modules');
	});

	it('exposes the same options as the e2e command', async () => {
		const { exitCode, output } = await runChef(['test', 'module', '--help']);

		assert.equal(exitCode, 0);
		assert.include(output, '--watch');
		assert.include(output, '--headed');
		assert.include(output, '--debug');
		assert.include(output, '--grep');
		assert.include(output, '--project');
		assert.include(output, '--reporter');
		assert.include(output, '--cdp-port');
	});
});
