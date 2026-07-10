import { describe, it } from 'mocha';
import { assert } from 'chai';

import { createE2eTestsTask } from '../../../src/commands/test/tasks/run-e2e-tests-task';

import type { E2eTarget } from '../../../src/commands/test/e2e-target';

// An empty target — no e2e tests. listTests is the only thing the task should need to reach
// before short-circuiting, so a real run would go no further than this.
function emptyTarget(): E2eTarget {
	return {
		name: 'demo',
		path: '/tmp/demo',
		testsDirectory: '/tmp/demo/tests',
		listTests: async () => [],
	};
}

describe('createE2eTestsTask — no test files', () => {
	it('skips with "no test files" when the target has no e2e tests, without running Playwright', async () => {
		const task = createE2eTestsTask(emptyTarget(), {});

		const result = await task.run();

		assert.equal(result.status, 'skipped');
		assert.match(result.title, /no test files/);
	});

	it('does the same for --list (no browser work when there are no files)', async () => {
		const task = createE2eTestsTask(emptyTarget(), { list: true });

		const result = await task.run();

		assert.equal(result.status, 'skipped');
		assert.match(result.title, /no test files/);
	});
});
