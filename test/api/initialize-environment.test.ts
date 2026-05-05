import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, it } from 'mocha';
import { assert } from 'chai';

import { initializeEnvironment } from '../../src/api/initialize-environment';
import { CF } from '../../src/diagnostics/diagnostic-codes';

import { sourceRepo } from '../fixtures/index';

describe('initializeEnvironment', () => {
	it('returns null on a valid project root', () => {
		const error = initializeEnvironment(sourceRepo);
		assert.isNull(error);
	});

	it('returns INVALID_CWD when directory does not exist', () => {
		const error = initializeEnvironment('/definitely/does/not/exist/here');

		assert.isNotNull(error);
		assert.equal(error!.code, CF.INVALID_CWD);
	});

	it('returns PROJECT_ROOT_NOT_FOUND when cwd is not a Bitrix project', () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-not-bitrix-'));
		try
		{
			const error = initializeEnvironment(tmp);

			assert.isNotNull(error);
			assert.equal(error!.code, CF.PROJECT_ROOT_NOT_FOUND);
		}
		finally
		{
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	it('does not throw on edge inputs', () => {
		assert.doesNotThrow(() => initializeEnvironment(''));
		assert.doesNotThrow(() => initializeEnvironment('/'));
	});
});
