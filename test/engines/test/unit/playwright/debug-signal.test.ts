import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { signalReady, waitForDebugger } from '../../../../../src/modules/engines/test/unit/playwright/debug-signal';

describe('debug-signal', () => {
	let signalDir: string;

	beforeEach(() => {
		signalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-signal-'));
	});

	afterEach(() => {
		fs.rmSync(signalDir, { recursive: true, force: true });
	});

	describe('signalReady', () => {
		it('should create ready file with CDP port', () => {
			const { readyFile } = signalReady(9222, signalDir);

			assert.isTrue(fs.existsSync(readyFile));
			assert.equal(fs.readFileSync(readyFile, 'utf-8'), '9222');
		});

		it('should return paths to ready and run files', () => {
			const { readyFile, runFile } = signalReady(9222, signalDir);

			assert.equal(readyFile, path.join(signalDir, 'ready'));
			assert.equal(runFile, path.join(signalDir, 'run'));
		});

		it('should clean up stale files before creating new ones', () => {
			fs.writeFileSync(path.join(signalDir, 'ready'), 'old');
			fs.writeFileSync(path.join(signalDir, 'run'), 'old');

			signalReady(9333, signalDir);

			assert.equal(fs.readFileSync(path.join(signalDir, 'ready'), 'utf-8'), '9333');
			assert.isFalse(fs.existsSync(path.join(signalDir, 'run')));
		});

		it('should create signal directory if it does not exist', () => {
			const nestedDir = path.join(signalDir, 'nested', 'dir');

			signalReady(9222, nestedDir);

			assert.isTrue(fs.existsSync(path.join(nestedDir, 'ready')));
		});
	});

	describe('waitForDebugger', () => {
		it('should resolve when run file appears', async () => {
			signalReady(9222, signalDir);

			// Simulate PhpStorm creating the run file after a short delay
			setTimeout(() => {
				fs.writeFileSync(path.join(signalDir, 'run'), '');
			}, 50);

			await waitForDebugger(signalDir);

			// Both files should be cleaned up
			assert.isFalse(fs.existsSync(path.join(signalDir, 'ready')));
			assert.isFalse(fs.existsSync(path.join(signalDir, 'run')));
		});

		it('should clean up both signal files after resolving', async () => {
			fs.writeFileSync(path.join(signalDir, 'ready'), '9222');
			fs.writeFileSync(path.join(signalDir, 'run'), '');

			await waitForDebugger(signalDir);

			assert.isFalse(fs.existsSync(path.join(signalDir, 'ready')));
			assert.isFalse(fs.existsSync(path.join(signalDir, 'run')));
		});
	});
});
