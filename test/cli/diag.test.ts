import { describe, it } from 'mocha';
import { assert } from 'chai';

import { runChef, sourceRepo } from './run-chef';

describe('chef diag', () => {
	const pathArgs = ['--path', sourceRepo];

	describe('top-used', () => {
		it('should show most depended-on extensions', async () => {
			const { exitCode, output } = await runChef(['diag', 'top-used', '--limit', '3', ...pathArgs]);

			assert.equal(exitCode, 0);
			assert.include(output, 'main.core');
		});
	});

	describe('top-deps', () => {
		it('should show extensions with most dependencies', async () => {
			const { exitCode, output } = await runChef(['diag', 'top-deps', '--limit', '3', ...pathArgs]);

			assert.equal(exitCode, 0);
			assert.include(output, 'Extension');
			assert.include(output, 'Dependencies');
		});
	});

	describe('top-deps-tree', () => {
		it('should show extensions with largest dependency tree', async () => {
			const { exitCode } = await runChef(['diag', 'top-deps-tree', ...pathArgs]);

			assert.equal(exitCode, 0);
		});
	});

	describe('top-bundle-size', () => {
		it('should show extensions with largest bundles', async () => {
			const { exitCode, output } = await runChef(['diag', 'top-bundle-size', ...pathArgs]);

			assert.equal(exitCode, 0);
			assert.match(output, /\d/);
		});
	});

	describe('top-total-size', () => {
		it('should show total transferred size', async () => {
			const { exitCode } = await runChef(['diag', 'top-total-size', ...pathArgs]);

			assert.equal(exitCode, 0);
		});
	});

	describe('config', () => {
		it('should find extensions with namespace', async () => {
			const { exitCode, output } = await runChef(['diag', 'config', '--key', 'namespace', ...pathArgs]);

			assert.equal(exitCode, 0);
			assert.include(output, 'BX.UI.WithConfig');
		});

		it('should find extensions missing namespace', async () => {
			const { exitCode, output } = await runChef(['diag', 'config', '--key', 'namespace', '--missing', ...pathArgs]);

			assert.equal(exitCode, 0);
			// Extensions without namespace should be listed
			assert.match(output, /\w+\.\w+/);
		});

		it('should find extensions with config keys except specified', async () => {
			const { exitCode } = await runChef(['diag', 'config', '--key', 'concat', '--except', ...pathArgs]);

			assert.equal(exitCode, 0);
		});
	});

	describe('unused-deps', () => {
		it('should find extensions with unused dependencies', async () => {
			const { exitCode, output } = await runChef(['diag', 'unused-deps', ...pathArgs]);

			assert.equal(exitCode, 0);
			assert.include(output, 'ui.forms');
		});
	});

	describe('circular-deps', () => {
		it('should detect circular dependencies across all extensions', async () => {
			const { exitCode, output } = await runChef(['diag', 'circular-deps', ...pathArgs]);

			assert.equal(exitCode, 1);
			assert.include(output, 'ui.circular-a');
			assert.include(output, 'ui.circular-b');
		});

		it('should detect circular dependencies for a specific extension', async () => {
			const { exitCode, output } = await runChef(['diag', 'circular-deps', 'ui.circular-a', ...pathArgs]);

			assert.equal(exitCode, 1);
			assert.include(output, 'circular');
		});

		it('should pass for extension without circular dependencies', async () => {
			const { exitCode, output } = await runChef(['diag', 'circular-deps', 'main.core', ...pathArgs]);

			assert.equal(exitCode, 0);
			assert.include(output, 'no circular dependencies');
		});
	});

	describe('circular-imports', () => {
		it('should detect circular imports across all extensions', async () => {
			const { exitCode, output } = await runChef(['diag', 'circular-imports', ...pathArgs]);

			assert.include(output, 'ui.circular-imports');
		});

		it('should detect circular imports for a specific extension', async () => {
			const { exitCode, output } = await runChef(['diag', 'circular-imports', 'ui.circular-imports', ...pathArgs]);

			assert.equal(exitCode, 1);
			assert.include(output, 'a.js');
			assert.include(output, 'b.js');
		});
	});

	describe('find-usages', () => {
		it('should find usages of an extension', async () => {
			const { exitCode, output } = await runChef(['diag', 'find-usages', 'main.core', ...pathArgs]);

			assert.equal(exitCode, 0);
			assert.match(output, /usage/i);
		});
	});

	describe('unused', () => {
		it('should find unused extensions', async () => {
			const { exitCode, output } = await runChef(['diag', 'unused', ...pathArgs]);

			assert.equal(exitCode, 0);
			assert.include(output, 'ui.unused');
		});
	});
});
