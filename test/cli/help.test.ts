import { describe, it } from 'mocha';
import { assert } from 'chai';

import { runChef } from './run-chef';

describe('chef --help', () => {
	it('should show help with all commands', async () => {
		const { exitCode, output } = await runChef(['--help']);

		assert.equal(exitCode, 0);
		assert.include(output, 'build');
		assert.include(output, 'lint');
		assert.include(output, 'test');
		assert.include(output, 'create');
		assert.include(output, 'init');
		assert.include(output, 'diag');
		assert.include(output, 'aliases');
	});

	it('should show build help with options', async () => {
		const { exitCode, output } = await runChef(['build', '--help']);

		assert.equal(exitCode, 0);
		assert.include(output, '--watch');
		assert.include(output, '--verbose');
		assert.include(output, '--force');
	});

	it('should show diag help with subcommands', async () => {
		const { exitCode, output } = await runChef(['diag', '--help']);

		assert.equal(exitCode, 0);
		assert.include(output, 'top-used');
		assert.include(output, 'top-deps');
		assert.include(output, 'circular-deps');
		assert.include(output, 'unused-deps');
	});

	it('should exit with error for unknown command', async () => {
		const { exitCode } = await runChef(['nonexistent']);

		assert.equal(exitCode, 1);
	});

	it('should point AI agents to the agent guide', async () => {
		const { output } = await runChef(['--help']);

		assert.include(output, 'chef help agent');
	});
});

describe('chef help', () => {
	it('should show the command list without arguments', async () => {
		const { exitCode, output } = await runChef(['help']);

		assert.equal(exitCode, 0);
		assert.include(output, 'build');
		assert.include(output, 'typecheck');
	});

	it('should show the full options of a command', async () => {
		const { exitCode, output } = await runChef(['help', 'build']);

		assert.equal(exitCode, 0);
		assert.include(output, '--watch');
		assert.include(output, '--reporter');
	});

	it('should show help for a subcommand', async () => {
		const { exitCode, output } = await runChef(['help', 'diag', 'deps-tree']);

		assert.equal(exitCode, 0);
		assert.include(output, '--depth');
	});

	it('should exit with error for unknown command', async () => {
		const { exitCode } = await runChef(['help', 'nonexistent']);

		assert.equal(exitCode, 1);
	});

	it('should print the agent guide', async () => {
		const { exitCode, output } = await runChef(['help', 'agent']);

		assert.equal(exitCode, 0);
		assert.match(output, /^# chef \S+ — guide for AI coding agents/);
		assert.include(output, '## What chef can do');
		assert.include(output, '- `chef build [extensions...]`');
		assert.include(output, '- CF1001 TS_TYPE_ERROR');
	});
});
