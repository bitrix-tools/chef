import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { validateBuildOptions } from '../../../src/modules/config/project/chef-config-validator';

import type { ChefConfig } from '../../../src/modules/config/project/chef-config';
import type { BuildOptions } from '../../../src/modules/engines/build/build-types';

function createBuildOptions(overrides: Partial<BuildOptions> = {}): BuildOptions
{
	return {
		input: '/tmp/test/src/index.js',
		output: { js: '/tmp/test/dist/bundle.js', css: '/tmp/test/dist/bundle.css' },
		packageRoot: '/tmp/test',
		publicPath: '/test/',
		targets: [],
		namespace: '',
		...overrides,
	};
}

describe('validateBuildOptions', () => {
	describe('deny rules', () => {
		it('should return no issues when deny is not set', async () => {
			const issues = await validateBuildOptions(createBuildOptions(), {});

			assert.isEmpty(issues);
		});

		it('should deny sfc', async () => {
			const issues = await validateBuildOptions(
				createBuildOptions({ vue: true }),
				{ deny: { sfc: true } },
			);

			assert.lengthOf(issues, 1);
			assert.equal(issues[0].option, 'sfc');
			assert.equal(issues[0].severity, 'error');
		});

		it('should deny minification', async () => {
			const issues = await validateBuildOptions(
				createBuildOptions({ minify: true }),
				{ deny: { minification: true } },
			);

			assert.lengthOf(issues, 1);
			assert.equal(issues[0].option, 'minification');
		});

		it('should support warning severity', async () => {
			const issues = await validateBuildOptions(
				createBuildOptions({ sourceMaps: true }),
				{ deny: { sourceMaps: { severity: 'warning' } } },
			);

			assert.lengthOf(issues, 1);
			assert.equal(issues[0].severity, 'warning');
		});

		it('should support custom message', async () => {
			const issues = await validateBuildOptions(
				createBuildOptions({ standalone: true }),
				{ deny: { standalone: { message: 'Custom message' } } },
			);

			assert.lengthOf(issues, 1);
			assert.equal(issues[0].message, 'Custom message');
		});

		it('should not report disabled rules', async () => {
			const issues = await validateBuildOptions(
				createBuildOptions({ minify: true }),
				{ deny: { minification: false } },
			);

			assert.isEmpty(issues);
		});
	});

	describe('deny exportDefault', () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-validator-')));
		});

		afterEach(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		function writeInput(content: string): string
		{
			const filePath = path.join(tmpDir, 'index.js');
			fs.writeFileSync(filePath, content);
			return filePath;
		}

		it('should deny export default class', async () => {
			const input = writeInput('export default class App {}');

			const issues = await validateBuildOptions(
				createBuildOptions({ input }),
				{ deny: { exportDefault: true } },
			);

			assert.lengthOf(issues, 1);
			assert.equal(issues[0].option, 'exportDefault');
			assert.equal(issues[0].severity, 'error');
		});

		it('should deny export default function', async () => {
			const input = writeInput('export default function main() {}');

			const issues = await validateBuildOptions(
				createBuildOptions({ input }),
				{ deny: { exportDefault: true } },
			);

			assert.lengthOf(issues, 1);
		});

		it('should deny export default expression', async () => {
			const input = writeInput(`const value = 42;\nexport default value;`);

			const issues = await validateBuildOptions(
				createBuildOptions({ input }),
				{ deny: { exportDefault: true } },
			);

			assert.lengthOf(issues, 1);
		});

		it('should not trigger for named exports', async () => {
			const input = writeInput('export class App {}\nexport function init() {}');

			const issues = await validateBuildOptions(
				createBuildOptions({ input }),
				{ deny: { exportDefault: true } },
			);

			assert.isEmpty(issues);
		});

		it('should not trigger for re-exports', async () => {
			const input = writeInput(`export { App } from './app';`);

			const issues = await validateBuildOptions(
				createBuildOptions({ input }),
				{ deny: { exportDefault: true } },
			);

			assert.isEmpty(issues);
		});

		it('should not trigger when rule is disabled', async () => {
			const input = writeInput('export default class App {}');

			const issues = await validateBuildOptions(
				createBuildOptions({ input }),
				{ deny: { exportDefault: false } },
			);

			assert.isEmpty(issues);
		});

		it('should support warning severity', async () => {
			const input = writeInput('export default class App {}');

			const issues = await validateBuildOptions(
				createBuildOptions({ input }),
				{ deny: { exportDefault: { severity: 'warning' } } },
			);

			assert.lengthOf(issues, 1);
			assert.equal(issues[0].severity, 'warning');
		});

		it('should support custom message', async () => {
			const input = writeInput('export default class App {}');

			const issues = await validateBuildOptions(
				createBuildOptions({ input }),
				{ deny: { exportDefault: { message: 'Use named exports' } } },
			);

			assert.equal(issues[0].message, 'Use named exports');
		});

		it('should not trigger for missing input file', async () => {
			const issues = await validateBuildOptions(
				createBuildOptions({ input: path.join(tmpDir, 'nonexistent.js') }),
				{ deny: { exportDefault: true } },
			);

			assert.isEmpty(issues);
		});

		it('should not false-positive on "export default" in string literal', async () => {
			const input = writeInput(`export const text = 'export default is fine in strings';`);

			const issues = await validateBuildOptions(
				createBuildOptions({ input }),
				{ deny: { exportDefault: true } },
			);

			assert.isEmpty(issues);
		});
	});
});
