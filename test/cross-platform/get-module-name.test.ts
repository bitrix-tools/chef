import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { ExtensionPackage } from '../../src/modules/packages/package/extension-package';
import { CustomPackage } from '../../src/modules/packages/package/custom-package';
import { ComponentPackage } from '../../src/modules/packages/package/component-package';
import { TemplatePackage } from '../../src/modules/packages/package/template-package';
import { Environment } from '../../src/environment/environment';

// getModuleName() must return the top-level module directory (e.g. "ui" for
// "<root>/ui/install/js/ui/buttons"). Current implementations use
// `this.getPath().split('/').shift()`, which is broken on every platform:
// — POSIX: an absolute path starts with "/" so split('/').shift() returns "".
// — Windows: split('/') yields a single element (full path) because the
//   separator is "\".
// The correct implementation must compute the module name relative to the
// project root using the platform separator.

describe('Package.getModuleName — module-relative resolution', () => {
	let tmpDir: string;
	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-module-name-')));
		sandbox.stub(Environment, 'getRoot').returns(tmpDir);
	});

	afterEach(() => {
		sandbox.restore();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('ExtensionPackage returns the module directory name', () => {
		const pkgPath = path.join(tmpDir, 'ui', 'install', 'js', 'ui', 'buttons');
		const pkg = new ExtensionPackage({ path: pkgPath });
		assert.equal(pkg.getModuleName(), 'ui');
	});

	it('CustomPackage returns the module directory name', () => {
		const pkgPath = path.join(tmpDir, 'main', 'install', 'js', 'main', 'core');
		const pkg = new CustomPackage({ path: pkgPath });
		assert.equal(pkg.getModuleName(), 'main');
	});

	it('ComponentPackage returns the module directory name', () => {
		const pkgPath = path.join(tmpDir, 'crm', 'install', 'components', 'bitrix', 'crm.deal');
		const pkg = new ComponentPackage({ path: pkgPath });
		assert.equal(pkg.getModuleName(), 'crm');
	});

	it('TemplatePackage returns the module directory name', () => {
		const pkgPath = path.join(tmpDir, 'ui', 'install', 'templates', 'bitrix24', 'header');
		const pkg = new TemplatePackage({ path: pkgPath });
		assert.equal(pkg.getModuleName(), 'ui');
	});
});
