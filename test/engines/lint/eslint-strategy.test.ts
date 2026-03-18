import * as path from 'node:path';
import * as fs from 'node:fs';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { ESLintStrategy } from '../../../src/modules/engines/lint/eslint/eslint-strategy';
import { FileFinder } from '../../../src/utils/file-finder';

describe('ESLintStrategy', () => {
	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('config discovery', () => {
		it('should skip when no config found', async () => {
			sandbox.stub(FileFinder, 'findUpFile').returns(null);

			const strategy = new ESLintStrategy();
			const result = await strategy.lint({
				sourcePath: '/project/ext/src',
				rootPath: '/project',
			});

			assert.isTrue(result.skipped);
			assert.include(result.skipReason, 'No eslint.config.js found');
			assert.isFalse(result.hasErrors());
			assert.isFalse(result.hasWarnings());
		});

		it('should return empty files array when skipped', async () => {
			sandbox.stub(FileFinder, 'findUpFile').returns(null);

			const strategy = new ESLintStrategy();
			const result = await strategy.lint({
				sourcePath: '/project/ext/src',
				rootPath: '/project',
			});

			assert.deepEqual(result.files, []);
			assert.equal(result.getErrorsCount(), 0);
			assert.equal(result.getWarningsCount(), 0);
		});
	});
});
