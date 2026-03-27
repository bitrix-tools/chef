import * as path from 'node:path';

import { describe, it } from 'mocha';
import { assert } from 'chai';

import { checkTypes } from '../../src/modules/engines/build/rollup/plugins/typescript';

const fixturesPath = path.resolve(import.meta.dirname, '../fixtures/source-repo/ui/install/js/ui');

describe('checkTypes', () => {
	it('should return no errors for valid TypeScript', async () => {
		const extensionPath = path.join(fixturesPath, 'ts-extension');

		const result = await checkTypes({ packageRoot: extensionPath });

		assert.isEmpty(result.errors);
	});

	it('should return CF1001 for type errors', async () => {
		const extensionPath = path.join(fixturesPath, 'ts-type-error');

		const result = await checkTypes({ packageRoot: extensionPath });

		assert.isNotEmpty(result.errors);
		assert.equal(result.errors[0].code, 'CF1001');
		assert.include(result.errors[0].message, 'TS2322');
	});

	it('should filter errors by file', async () => {
		const extensionPath = path.join(fixturesPath, 'ts-multi-file');

		const result = await checkTypes({
			packageRoot: extensionPath,
			files: [path.join(extensionPath, 'src/valid.ts')],
		});

		assert.isEmpty(result.errors);
	});

	it('should report errors for specified file only', async () => {
		const extensionPath = path.join(fixturesPath, 'ts-multi-file');

		const result = await checkTypes({
			packageRoot: extensionPath,
			files: [path.join(extensionPath, 'src/index.ts')],
		});

		assert.isNotEmpty(result.errors);
		assert.equal(result.errors[0].code, 'CF1001');
	});

	it('should return no errors when src directory is missing', async () => {
		const extensionPath = path.join(fixturesPath, 'basic-extension');

		const result = await checkTypes({ packageRoot: extensionPath });

		assert.isEmpty(result.errors);
	});

	it('should exclude files from type checking', async () => {
		const extensionPath = path.join(fixturesPath, 'ts-multi-file');

		const result = await checkTypes({
			packageRoot: extensionPath,
			exclude: [path.join(extensionPath, 'src/index.ts')],
		});

		assert.isEmpty(result.errors);
	});

	it('should exclude files by glob pattern', async () => {
		const extensionPath = path.join(fixturesPath, 'ts-multi-file');

		const result = await checkTypes({
			packageRoot: extensionPath,
			exclude: [path.join(extensionPath, 'src/ind*.ts')],
		});

		assert.isEmpty(result.errors);
	});

	it('should pass compilerOptions through', async () => {
		const extensionPath = path.join(fixturesPath, 'ts-extension');

		const result = await checkTypes({
			packageRoot: extensionPath,
			compilerOptions: {
				lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
			},
		});

		assert.isEmpty(result.errors);
	});
});
