import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { AliasGenerator } from '../../src/modules/services/alias-generator';
import { Environment } from '../../src/environment/environment';
import { runChef, sourceRepo } from '../cli/run-chef';

// On Windows path.relative() returns "foo\\bar\\src"; storing it in
// aliases.tsconfig.json yields TypeScript-incompatible entries since paths in
// tsconfig must use POSIX separators. AliasGenerator must always emit
// forward-slash paths regardless of the host platform.

describe('AliasGenerator — POSIX separators in aliases.tsconfig.json', () => {
	let tmpDir: string;
	let sandbox: sinon.SinonSandbox;

	beforeEach(async () => {
		sandbox = sinon.createSandbox();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-alias-paths-'));

		sandbox.stub(Environment, 'getType').returns('project');
		sandbox.stub(Environment, 'getRoot').returns(tmpDir);
	});

	afterEach(async () => {
		sandbox.restore();
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('addAlias must store the path with forward slashes', async () => {
		const aliasesPath = path.join(tmpDir, 'aliases.tsconfig.json');
		await fs.writeFile(aliasesPath, JSON.stringify({ compilerOptions: { baseUrl: tmpDir, paths: {} } }));

		const generator = new AliasGenerator();
		await generator.addAlias({
			rootPath: tmpDir,
			extensionName: 'ui.buttons',
			packagePath: path.join(tmpDir, 'local', 'js', 'ui', 'buttons'),
		});

		const aliases = JSON.parse(await fs.readFile(aliasesPath, 'utf8'));
		const value: string = aliases.compilerOptions.paths['ui.buttons'][0];
		assert.equal(value, './local/js/ui/buttons/src');
		assert.notInclude(value, '\\', 'alias path must not contain backslashes');
	});

	it('update must store added paths with forward slashes', async () => {
		const aliasesPath = path.join(tmpDir, 'aliases.tsconfig.json');
		await fs.writeFile(aliasesPath, JSON.stringify({ compilerOptions: { baseUrl: tmpDir, paths: {} } }));

		const extensionDir = path.join(tmpDir, 'local', 'js', 'ui', 'widget');
		await fs.mkdir(path.join(extensionDir, 'src'), { recursive: true });
		await fs.writeFile(
			path.join(extensionDir, 'bundle.config.js'),
			'module.exports = { input: "src/index.js", output: "dist/widget.bundle.js" };',
		);

		const generator = new AliasGenerator();
		await generator.update({
			rootPath: tmpDir,
			added: [extensionDir],
			removed: [],
		});

		const aliases = JSON.parse(await fs.readFile(aliasesPath, 'utf8'));
		const value: string = aliases.compilerOptions.paths['ui.widget'][0];
		assert.match(value, /^\.\//, 'alias path must start with "./"');
		assert.notInclude(value, '\\', 'alias path must use forward slashes');
	});
});

describe('chef aliases — POSIX separators across the generated file', () => {
	let tmpRepo: string;

	beforeEach(() => {
		tmpRepo = fsSync.realpathSync(fsSync.mkdtempSync(path.join(os.tmpdir(), 'chef-aliases-posix-')));
		fsSync.cpSync(sourceRepo, tmpRepo, { recursive: true });
	});

	afterEach(() => {
		fsSync.rmSync(tmpRepo, { recursive: true, force: true });
	});

	it('every path in aliases.tsconfig.json must use forward slashes only', async () => {
		const { exitCode } = await runChef(['aliases'], { cwd: tmpRepo });
		assert.equal(exitCode, 0);

		const aliases = JSON.parse(fsSync.readFileSync(path.join(tmpRepo, 'aliases.tsconfig.json'), 'utf8'));
		for (const [name, value] of Object.entries(aliases.compilerOptions.paths as Record<string, string[]>))
		{
			for (const entry of value)
			{
				assert.notInclude(entry, '\\', `alias path "${entry}" for "${name}" must use forward slashes`);
			}
		}
	});
});
