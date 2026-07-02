import * as path from 'node:path';

import { describe, it } from 'mocha';
import { assert } from 'chai';

import {
	isBareFilePath,
	stripKnownExtension,
	isInsideDirectory,
	sharesDirectoryPrefix,
} from '../../src/modules/engines/build/declaration/declaration-bundler';

// These helpers back the cross-extension import-type resolution in the declaration
// bundler: recognising the bare file paths TS emits for a type reached through a
// container class, and narrowing which extension entries to inspect.
describe('declaration bundler path helpers', () => {
	describe('isBareFilePath', () => {
		it('accepts a bare file-like path', () => {
			assert.isTrue(isBareFilePath('main/install/js/main/core/src/lib/cache/memory-cache'));
		});

		it('rejects a relative path', () => {
			assert.isFalse(isBareFilePath('./memory-cache'));
			assert.isFalse(isBareFilePath('../lib/memory-cache'));
		});

		it('rejects a scoped npm package', () => {
			assert.isFalse(isBareFilePath('@vue/runtime-core'));
		});

		it('rejects a bare specifier without a slash (looks like a package)', () => {
			assert.isFalse(isBareFilePath('typescript'));
		});
	});

	describe('stripKnownExtension', () => {
		it('drops .d.ts, .ts and .js so paths compare equal', () => {
			const base = '/repo/main/core/src/lib/cache/memory-cache';
			assert.equal(stripKnownExtension(`${base}.d.ts`), base);
			assert.equal(stripKnownExtension(`${base}.ts`), base);
			assert.equal(stripKnownExtension(`${base}.js`), base);
		});

		it('leaves a path without a known extension untouched', () => {
			assert.equal(stripKnownExtension('/repo/foo/bar'), '/repo/foo/bar');
		});
	});

	describe('isInsideDirectory', () => {
		it('detects a file inside the directory', () => {
			assert.isTrue(isInsideDirectory(path.join('/repo/ext', 'src', 'index.ts'), '/repo/ext'));
		});

		it('rejects a file outside the directory', () => {
			assert.isFalse(isInsideDirectory('/repo/other/index.ts', '/repo/ext'));
		});

		it('rejects the directory itself', () => {
			assert.isFalse(isInsideDirectory('/repo/ext', '/repo/ext'));
		});
	});

	describe('sharesDirectoryPrefix', () => {
		it('matches extensions in the same module subtree', () => {
			const cacheEntryDir = path.join('/repo', 'main', 'install', 'js', 'main', 'core', 'cache', 'src');
			const memoryCacheDir = path.join('/repo', 'main', 'install', 'js', 'main', 'core', 'src', 'lib', 'cache');
			assert.isTrue(sharesDirectoryPrefix(cacheEntryDir, memoryCacheDir));
		});

		it('rejects extensions in different modules', () => {
			const uiDir = path.join('/repo', 'ui', 'install', 'js', 'ui', 'buttons', 'src');
			const coreDir = path.join('/repo', 'main', 'install', 'js', 'main', 'core', 'src');
			assert.isFalse(sharesDirectoryPrefix(uiDir, coreDir));
		});

		it('rejects different extensions in the same module', () => {
			const dateDir = path.join('/repo', 'main', 'install', 'js', 'main', 'date', 'src');
			const coreDir = path.join('/repo', 'main', 'install', 'js', 'main', 'core', 'src');
			assert.isFalse(sharesDirectoryPrefix(dateDir, coreDir));
		});
	});
});
