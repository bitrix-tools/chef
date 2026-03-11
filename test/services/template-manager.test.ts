import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { TemplateManager } from '../../src/modules/services/template-manager';

describe('TemplateManager', () => {
	let tmpDir: string;
	let templateManager: TemplateManager;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-template-'));
		templateManager = new TemplateManager(tmpDir);
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	describe('get', () => {
		it('should return template content when file exists', async () => {
			await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'Hello, World!');

			const result = await templateManager.get('hello.txt');
			assert.equal(result, 'Hello, World!');
		});

		it('should return null when file does not exist', async () => {
			const result = await templateManager.get('nonexistent.txt');
			assert.isNull(result);
		});

		it('should read template with utf-8 encoding', async () => {
			await fs.writeFile(path.join(tmpDir, 'unicode.txt'), 'Привет, мир! 🌍');

			const result = await templateManager.get('unicode.txt');
			assert.equal(result, 'Привет, мир! 🌍');
		});
	});

	describe('render', () => {
		it('should replace placeholders with values', async () => {
			await fs.writeFile(path.join(tmpDir, 'greeting.txt'), 'Hello, {{name}}! Welcome to {{place}}.');

			const result = await templateManager.render('greeting.txt', {
				'{{name}}': 'Alice',
				'{{place}}': 'Wonderland',
			});

			assert.equal(result, 'Hello, Alice! Welcome to Wonderland.');
		});

		it('should replace all occurrences of the same placeholder', async () => {
			await fs.writeFile(path.join(tmpDir, 'repeat.txt'), '{{x}} and {{x}} again');

			const result = await templateManager.render('repeat.txt', {
				'{{x}}': 'test',
			});

			assert.equal(result, 'test and test again');
		});

		it('should return null when template does not exist', async () => {
			const result = await templateManager.render('missing.txt', { key: 'value' });
			assert.isNull(result);
		});

		it('should return unmodified content when no matching keys', async () => {
			await fs.writeFile(path.join(tmpDir, 'static.txt'), 'No replacements here');

			const result = await templateManager.render('static.txt', {
				'{{unused}}': 'value',
			});

			assert.equal(result, 'No replacements here');
		});

		it('should handle empty data', async () => {
			await fs.writeFile(path.join(tmpDir, 'empty.txt'), 'Content stays');

			const result = await templateManager.render('empty.txt', {});
			assert.equal(result, 'Content stays');
		});
	});
});
