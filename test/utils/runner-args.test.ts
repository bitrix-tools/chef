import { describe, it } from 'mocha';
import { assert } from 'chai';

import { routeRunnerArgs } from '../../src/utils/cli/runner-args';

describe('routeRunnerArgs', () => {
	it('keeps positional arguments with chef', () => {
		const { chefArgs, runnerArgs } = routeRunnerArgs(['e2e', 'main.core', 'dom.spec.ts']);

		assert.deepEqual(chefArgs, ['e2e', 'main.core', 'dom.spec.ts']);
		assert.deepEqual(runnerArgs, []);
	});

	it("keeps chef's own options with chef", () => {
		const { chefArgs, runnerArgs } = routeRunnerArgs(['e2e', 'main.core', '--headed', '--grep', 'Button']);

		assert.deepEqual(chefArgs, ['e2e', 'main.core', '--headed', '--grep', 'Button']);
		assert.deepEqual(runnerArgs, []);
	});

	it('routes a Playwright flag to the runner', () => {
		const { chefArgs, runnerArgs } = routeRunnerArgs(['e2e', 'main.core', '--update-snapshots']);

		assert.deepEqual(chefArgs, ['e2e', 'main.core']);
		assert.deepEqual(runnerArgs, ['--update-snapshots']);
	});

	it('routes a value written with an equals sign', () => {
		const { chefArgs, runnerArgs } = routeRunnerArgs(['e2e', 'main.core', '--repeat-each=3']);

		assert.deepEqual(chefArgs, ['e2e', 'main.core']);
		assert.deepEqual(runnerArgs, ['--repeat-each=3']);
	});

	it('routes a value written as a separate argument', () => {
		const { chefArgs, runnerArgs } = routeRunnerArgs(['e2e', 'main.core', '--repeat-each', '3']);

		assert.deepEqual(chefArgs, ['e2e', 'main.core']);
		assert.deepEqual(runnerArgs, ['--repeat-each', '3']);
	});

	it('does not swallow the next option as a value', () => {
		const { chefArgs, runnerArgs } = routeRunnerArgs(['e2e', '--repeat-each', '--headed', 'main.core']);

		assert.deepEqual(chefArgs, ['e2e', '--headed', 'main.core']);
		assert.deepEqual(runnerArgs, ['--repeat-each']);
	});

	it('routes an option chef has never heard of', () => {
		const { chefArgs, runnerArgs } = routeRunnerArgs(['e2e', 'main.core', '--brand-new-option']);

		assert.deepEqual(chefArgs, ['e2e', 'main.core']);
		assert.deepEqual(runnerArgs, ['--brand-new-option']);
	});

	it('routes short Playwright options', () => {
		const { chefArgs, runnerArgs } = routeRunnerArgs(['e2e', 'main.core', '-u', '-j', '1']);

		assert.deepEqual(chefArgs, ['e2e', 'main.core']);
		assert.deepEqual(runnerArgs, ['-u', '-j', '1']);
	});

	it("keeps chef's short options with chef", () => {
		const { chefArgs, runnerArgs } = routeRunnerArgs(['e2e', '-w', '-p', '/srv/bitrix']);

		assert.deepEqual(chefArgs, ['e2e', '-w', '-p', '/srv/bitrix']);
		assert.deepEqual(runnerArgs, []);
	});

	it('splits a mixed command line', () => {
		const { chefArgs, runnerArgs } = routeRunnerArgs([
			'e2e', 'ui.buttons', '--project', 'chromium', '--update-snapshots', '--workers', '1', '--console',
		]);

		assert.deepEqual(chefArgs, ['e2e', 'ui.buttons', '--project', 'chromium', '--console']);
		assert.deepEqual(runnerArgs, ['--update-snapshots', '--workers', '1']);
	});

	it('leaves a lone dash as a positional argument', () => {
		const { chefArgs, runnerArgs } = routeRunnerArgs(['e2e', '-']);

		assert.deepEqual(chefArgs, ['e2e', '-']);
		assert.deepEqual(runnerArgs, []);
	});
});
