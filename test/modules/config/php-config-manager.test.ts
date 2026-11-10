import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { PhpConfigManager } from '../../../src/modules/config/php/php-config-manager';

describe('PhpConfigManager', () => {
	describe('namespace', () => {
		let dir: string;
		let configPath: string;

		beforeEach(() => {
			dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-php-config-'));
			configPath = path.join(dir, 'config.php');
		});

		afterEach(() => {
			fs.rmSync(dir, { recursive: true, force: true });
		});

		function save(source: string, namespace?: string): string
		{
			fs.writeFileSync(configPath, source);

			const config = new PhpConfigManager();
			config.loadFromFile(configPath);
			config.set('rel', ['main.core']);
			if (namespace !== undefined)
			{
				config.set('namespace', namespace);
			}

			config.save(configPath, 'test.extension');

			return fs.readFileSync(configPath, 'utf-8');
		}

		it('adds the namespace right before rel', () => {
			const result = save(
				"<?php\nreturn [\n\t'js' => 'dist/index.bundle.js',\n\t'rel' => [\n\t\t'main.core',\n\t],\n\t'skip_core' => false,\n];\n",
				'BX.Test',
			);

			assert.equal(
				result,
				"<?php\nreturn [\n\t'js' => 'dist/index.bundle.js',\n\t'namespace' => 'BX.Test',\n\t'rel' => [\n\t\t'main.core',\n\t],\n\t'skip_core' => false,\n];\n",
			);
		});

		it('replaces the namespace of a previous build', () => {
			const result = save(
				"<?php\nreturn [\n\t'js' => 'dist/index.bundle.js',\n\t'namespace' => 'BX.Old',\n\t'rel' => [\n\t\t'main.core',\n\t],\n\t'skip_core' => false,\n];\n",
				'BX.New',
			);

			assert.include(result, "\t'namespace' => 'BX.New',\n\t'rel' => [");
			assert.notInclude(result, 'BX.Old');
			assert.equal(result.match(/'namespace'/g)?.length, 1);
		});

		it('writes an empty namespace', () => {
			const result = save("<?php\nreturn [\n\t'rel' => [],\n];\n", '');

			assert.include(result, "\t'namespace' => '',\n\t'rel' => [");
		});

		it('keeps a namespace key of a nested array', () => {
			const result = save(
				"<?php\nreturn [\n\t'settings' => [\n\t\t'namespace' => 'custom',\n\t],\n\t'rel' => [],\n];\n",
				'BX.Test',
			);

			assert.include(result, "\t\t'namespace' => 'custom',");
			assert.include(result, "\t'namespace' => 'BX.Test',\n\t'rel' => [");
		});

		it('follows the indentation of rel', () => {
			const result = save("<?php\nreturn [\n    'rel' => [],\n];\n", 'BX.Test');

			assert.include(result, "\n    'namespace' => 'BX.Test',\n    'rel' => [");
		});

		it('escapes quotes and backslashes for a PHP string', () => {
			const result = save("<?php\nreturn [\n\t'rel' => [],\n];\n", "BX.It's\\Test");

			assert.include(result, "'namespace' => 'BX.It\\'s\\\\Test',");
		});

		it('does not write a namespace that is not set', () => {
			const result = save("<?php\nreturn [\n\t'rel' => [],\n];\n");

			assert.notInclude(result, 'namespace');
		});
	});
});
