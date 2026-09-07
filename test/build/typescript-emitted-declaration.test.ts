import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { checkTypes } from '../../src/modules/engines/build/rollup/plugins/typescript';

/**
 * A build emits its bundle declaration next to the output .js, in the package root.
 * Feeding it back into the next type check turns BX from an unknown global into a type
 * with a single member, so untouched sources start failing with TS2339 — every
 * successful build would break the following one.
 */
describe('checkTypes with an emitted bundle declaration', () => {
	let tmp: string;
	let outputJs: string;

	beforeEach(() => {
		tmp = mkdtempSync(path.join(os.tmpdir(), 'chef-ts-dts-'));
		mkdirSync(path.join(tmp, 'src'), { recursive: true });
		outputJs = path.join(tmp, 'script.js');

		writeFileSync(
			path.join(tmp, 'src', 'index.ts'),
			'BX.PopupWindow; BX.Main.filterManager;\nexport const value = 1;\n',
			'utf-8',
		);
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	function writeEmittedDeclaration(): void
	{
		writeFileSync(
			path.join(tmp, 'script.d.ts'),
			'declare namespace BX.Main {\n\tconst filterManager: number;\n}\n',
			'utf-8',
		);
	}

	it('should ignore the declaration emitted for its own bundle', async () => {
		writeEmittedDeclaration();

		const result = await checkTypes({
			packageRoot: tmp,
			exclude: [outputJs, path.join(tmp, 'style.css')],
		});

		assert.deepEqual(result.errors.map((error) => error.message), []);
	});

	it('should report no errors when the declaration is absent', async () => {
		const result = await checkTypes({
			packageRoot: tmp,
			exclude: [outputJs],
		});

		assert.deepEqual(result.errors.map((error) => error.message), []);
	});

	it('should still read declarations it did not emit', async () => {
		writeEmittedDeclaration();
		writeFileSync(path.join(tmp, 'globals.d.ts'), 'declare const answer: number;\n', 'utf-8');
		writeFileSync(
			path.join(tmp, 'src', 'probe.ts'),
			'export const wrong: string = answer;\n',
			'utf-8',
		);

		const result = await checkTypes({
			packageRoot: tmp,
			exclude: [outputJs],
		});

		assert.lengthOf(result.errors, 1);
		assert.include(result.errors[0].message, 'TS2322');
	});
});
