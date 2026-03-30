import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { FileFinder } from '../../src/utils/file-finder';

describe('getChefVersion', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-version-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true });
	});

	function createPackageJson(dir: string, content: Record<string, unknown>): void
	{
		fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(content));
	}

	describe('from source (src/utils/)', () => {
		it('should find package.json walking up from src/utils/', () => {
			// Simulate: root/src/utils/ → root/package.json
			const srcUtils = path.join(tmpDir, 'src', 'utils');
			fs.mkdirSync(srcUtils, { recursive: true });
			createPackageJson(tmpDir, { name: '@bitrix/chef', version: '1.5.0' });

			const pkgPath = FileFinder.findUpFile({
				fileName: 'package.json',
				fromDir: srcUtils,
				rootDir: '/',
			});

			assert.isNotNull(pkgPath);
			const pkg = JSON.parse(fs.readFileSync(pkgPath!, 'utf-8'));
			assert.equal(pkg.name, '@bitrix/chef');
			assert.equal(pkg.version, '1.5.0');
		});

		it('should find package.json walking up from src/diagnostics/', () => {
			// Simulate: root/src/diagnostics/ → root/package.json
			const srcDiag = path.join(tmpDir, 'src', 'diagnostics');
			fs.mkdirSync(srcDiag, { recursive: true });
			createPackageJson(tmpDir, { name: '@bitrix/chef', version: '2.0.0' });

			const pkgPath = FileFinder.findUpFile({
				fileName: 'package.json',
				fromDir: srcDiag,
				rootDir: '/',
			});

			assert.isNotNull(pkgPath);
			const pkg = JSON.parse(fs.readFileSync(pkgPath!, 'utf-8'));
			assert.equal(pkg.version, '2.0.0');
		});
	});

	describe('from bundle (dist/)', () => {
		it('should find package.json walking up from dist/', () => {
			// Simulate: root/dist/ → root/package.json
			const dist = path.join(tmpDir, 'dist');
			fs.mkdirSync(dist, { recursive: true });
			createPackageJson(tmpDir, { name: '@bitrix/chef', version: '1.5.0' });

			const pkgPath = FileFinder.findUpFile({
				fileName: 'package.json',
				fromDir: dist,
				rootDir: '/',
			});

			assert.isNotNull(pkgPath);
			const pkg = JSON.parse(fs.readFileSync(pkgPath!, 'utf-8'));
			assert.equal(pkg.name, '@bitrix/chef');
			assert.equal(pkg.version, '1.5.0');
		});
	});

	describe('edge cases', () => {
		it('should return null when no package.json exists', () => {
			const deep = path.join(tmpDir, 'a', 'b', 'c');
			fs.mkdirSync(deep, { recursive: true });

			const pkgPath = FileFinder.findUpFile({
				fileName: 'package.json',
				fromDir: deep,
				rootDir: tmpDir,
			});

			assert.isNull(pkgPath);
		});

		it('should find nearest package.json first', () => {
			// root/package.json (name: other)
			// root/nested/package.json (name: @bitrix/chef)
			const nested = path.join(tmpDir, 'nested', 'dist');
			fs.mkdirSync(nested, { recursive: true });
			createPackageJson(tmpDir, { name: 'other', version: '0.0.1' });
			createPackageJson(path.join(tmpDir, 'nested'), { name: '@bitrix/chef', version: '3.0.0' });

			const pkgPath = FileFinder.findUpFile({
				fileName: 'package.json',
				fromDir: nested,
				rootDir: '/',
			});

			assert.isNotNull(pkgPath);
			const pkg = JSON.parse(fs.readFileSync(pkgPath!, 'utf-8'));
			// findUpFile returns nearest — which is @bitrix/chef
			assert.equal(pkg.name, '@bitrix/chef');
			assert.equal(pkg.version, '3.0.0');
		});
	});

	describe('real project', () => {
		it('should resolve version from actual chef project', async () => {
			// Dynamic import to get a fresh module (bypasses cached version)
			const realPkgPath = FileFinder.findUpFile({
				fileName: 'package.json',
				fromDir: path.join(process.cwd(), 'src', 'utils'),
				rootDir: '/',
			});

			assert.isNotNull(realPkgPath);
			const pkg = JSON.parse(fs.readFileSync(realPkgPath!, 'utf-8'));
			assert.equal(pkg.name, '@bitrix/chef');
			assert.match(pkg.version, /^\d+\.\d+\.\d+/);
		});

		it('should resolve version from dist/ path', () => {
			const realPkgPath = FileFinder.findUpFile({
				fileName: 'package.json',
				fromDir: path.join(process.cwd(), 'dist'),
				rootDir: '/',
			});

			assert.isNotNull(realPkgPath);
			const pkg = JSON.parse(fs.readFileSync(realPkgPath!, 'utf-8'));
			assert.equal(pkg.name, '@bitrix/chef');
			assert.match(pkg.version, /^\d+\.\d+\.\d+/);
		});
	});
});
