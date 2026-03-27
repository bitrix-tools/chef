import * as path from 'node:path';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import sinon from 'sinon';

import { BuildEngine } from '../../src/modules/engines/build/build-engine';
import { RollupBuildStrategy } from '../../src/modules/engines/build/rollup/rollup-strategy';
import { Environment } from '../../src/environment/environment';
import { PackageResolver } from '../../src/modules/packages/package-resolver';

const sourceRepo = path.resolve(import.meta.dirname, '../cli/fixtures/source-repo');
const projectRepo = path.resolve(import.meta.dirname, '../cli/fixtures/project-repo');

type RepoConfig = {
	name: string;
	type: 'source' | 'project';
	repoPath: string;
	jsExtensionPath: string;
	tsExtensionPath: string;
	jsLibName: string;
	jsLibMethod: string;
	tsLibName: string;
};

const repos: RepoConfig[] = [
	{
		name: 'source-repo',
		type: 'source',
		repoPath: sourceRepo,
		jsExtensionPath: path.join(sourceRepo, 'ui/install/js/ui/buttons'),
		tsExtensionPath: path.join(sourceRepo, 'main/install/js/main/ts-lib'),
		jsLibName: 'main.core',
		jsLibMethod: 'Core',
		tsLibName: 'main.ts-lib',
	},
	{
		name: 'project-repo',
		type: 'project',
		repoPath: projectRepo,
		jsExtensionPath: path.join(projectRepo, 'local/js/local/buttons'),
		tsExtensionPath: path.join(projectRepo, 'local/js/local/ts-lib'),
		jsLibName: 'local.forms',
		jsLibMethod: 'Form',
		tsLibName: 'local.ts-lib',
	},
];

for (const repo of repos)
{
	describe(`buildCode standalone (${repo.name})`, () => {
		let buildService: BuildEngine;
		let sandbox: sinon.SinonSandbox;

		beforeEach(() => {
			sandbox = sinon.createSandbox();
			sandbox.stub(Environment, 'getRoot').returns(repo.repoPath);
			sandbox.stub(Environment, 'getType').returns(repo.type);
			buildService = new BuildEngine(new RollupBuildStrategy());
		});

		afterEach(() => {
			PackageResolver.clearCache();
			sandbox.restore();
		});

		it('should bundle JS code with standalone mode', async () => {
			const code = `
				export class Component {
					render() { return '<div>test</div>'; }
				}
			`;

			const result = await buildService.buildCode({
				code,
				packageRoot: repo.jsExtensionPath,
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.Standalone',
				standalone: true,
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.isString(result.code, 'Should return code as string');
			assert.include(result.code, 'Component', 'Code should contain class name');
		});

		it('should treat unresolved dependencies as external in standalone mode', async () => {
			const code = `
				import { Something } from 'nonexistent.extension';
				export const value = 42;
			`;

			const result = await buildService.buildCode({
				code,
				packageRoot: repo.jsExtensionPath,
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.Standalone',
				standalone: true,
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.dependencies, 'nonexistent.extension', 'Unresolved dependency should be external');
		});

		it('should inline resolved JS dependency in standalone mode', async () => {
			const code = `
				import { ${repo.jsLibMethod} } from '${repo.jsLibName}';
				export class App {
					init() { return ${repo.jsLibMethod}; }
				}
			`;

			const result = await buildService.buildCode({
				code,
				packageRoot: repo.jsExtensionPath,
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.Standalone',
				standalone: true,
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.code, 'App', 'Code should contain own class');
			assert.notInclude(result.dependencies, repo.jsLibName, 'Inlined dependency should not be listed as external');
		});

		it('should transpile TypeScript code in standalone mode', async () => {
			const code = `
				interface Config {
					timeout: number;
				}

				export class Service {
					#config: Config;

					constructor(config: Config) {
						this.#config = config;
					}

					getTimeout(): number {
						return this.#config.timeout;
					}
				}
			`;

			const result = await buildService.buildCode({
				code,
				packageRoot: repo.tsExtensionPath,
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.TsStandalone',
				typescript: true,
				standalone: true,
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.code, 'Service', 'Should contain class name');
			assert.notInclude(result.code, ': Config', 'Type annotations should be stripped');
		});

		it('should inline and transpile TS dependency from JS extension', async () => {
			const code = `
				import { TsLib } from '${repo.tsLibName}';
				export class App {
					init() { return new TsLib({ name: 'test', version: 1 }); }
				}
			`;

			const result = await buildService.buildCode({
				code,
				packageRoot: repo.jsExtensionPath,
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.JsWithTsDep',
				standalone: true,
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.code, 'App', 'Code should contain own class');
			assert.include(result.code, 'TsLib', 'Code should inline TS dependency');
			assert.include(result.code, 'getName', 'Inlined TS code should contain methods');
			assert.notInclude(result.code, ': LibConfig', 'TypeScript types should be stripped');
			assert.notInclude(result.code, 'interface', 'Interfaces should be stripped');
		});

		it('should inline and transpile TS dependency from TS extension', async () => {
			const code = `
				import { TsLib } from '${repo.tsLibName}';

				export class TsApp {
					#lib: InstanceType<typeof TsLib>;

					constructor() {
						this.#lib = new TsLib({ name: 'app', version: 2 });
					}

					getLibName(): string {
						return this.#lib.getName();
					}
				}
			`;

			const result = await buildService.buildCode({
				code,
				packageRoot: repo.tsExtensionPath,
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.TsWithTsDep',
				typescript: true,
				standalone: true,
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.include(result.code, 'TsApp', 'Code should contain own class');
			assert.include(result.code, 'TsLib', 'Code should inline TS dependency');
			assert.notInclude(result.code, ': string', 'Type annotations should be stripped');
		});

		it('should return sourcemap with standalone mode', async () => {
			const code = `export const value = 42;`;

			const result = await buildService.buildCode({
				code,
				packageRoot: repo.jsExtensionPath,
				publicPath: '/test/',
				targets: [],
				namespace: 'BX.Test.Sourcemap',
				standalone: true,
				sourcemap: true,
			});

			assert.isEmpty(result.errors, 'Should have no errors');
			assert.isNotNull(result.map, 'Should return sourcemap');
			assert.isString(result.map?.mappings, 'Sourcemap should have mappings');
		});
	});
}
