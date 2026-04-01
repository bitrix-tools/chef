import * as path from 'node:path';
import * as fs from 'node:fs';
import { describe, it, afterEach } from 'mocha';
import { assert } from 'chai';

import { runChef, sourceRepo } from './run-chef';
import { extensionPath } from '../fixtures/index';

describe('chef diag', () => {
	const pathArgs = ['--path', sourceRepo];

	// basic-extension has bundle.config.js but no config.php —
	// getDependencies() must use generate() (in-memory) instead of build() (writes to disk).
	const basicExtensionDist = path.join(extensionPath('basic-extension'), 'dist');

	afterEach(() => {
		if (fs.existsSync(basicExtensionDist))
		{
			fs.rmSync(basicExtensionDist, { recursive: true });
			assert.fail('diag command created dist/ directory — getDependencies() must not write files');
		}
	});

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

		it('should detect self-dependency', async () => {
			const { exitCode, output } = await runChef(['diag', 'circular-deps', 'ui.circular-self', ...pathArgs]);

			assert.equal(exitCode, 1);
			assert.include(output, 'ui.circular-self');
			assert.match(output, /ui\.circular-self → ui\.circular-self/);
		});

		it('should only report direct A → B → A cycles, not longer chains', async () => {
			const { exitCode, output } = await runChef(['diag', 'circular-deps', 'ui.circular-a', ...pathArgs]);

			assert.equal(exitCode, 1);
			// A → B → A is a direct cycle
			assert.include(output, 'ui.circular-a');
			assert.include(output, 'ui.circular-b');
			// Should not contain longer chains
			assert.notMatch(output, /→.*→.*→.*→/);
		});

		it('should filter extensions with --include', async () => {
			const { exitCode, output } = await runChef(['diag', 'circular-deps', '--include', 'ui.circular-a.**', ...pathArgs]);

			assert.include(output, 'ui.circular-a');
			assert.notInclude(output, 'ui.circular-self');
		});

		it('should scan only matching extensions with --include', async () => {
			const { output } = await runChef(['diag', 'circular-deps', '--include', 'ui.circular-a', ...pathArgs]);

			// Should check only 1 extension, not all
			assert.match(output, /Checked 1 extension/);
		});

		it('should not produce duplicate output', async () => {
			const { output } = await runChef(['diag', 'circular-deps', '--include', 'ui.circular-**', ...pathArgs]);

			const scanHeaders = output.match(/Circular dependency scan/g) || [];
			assert.equal(scanHeaders.length, 1);
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
