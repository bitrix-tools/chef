import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import sinon from 'sinon';

import { RollupBuildStrategy } from '../../../src/modules/engines/build/rollup/rollup-strategy';
import { Environment } from '../../../src/environment/environment';
import { CF } from '../../../src/diagnostics/diagnostic-codes';

import type { RollupLog } from 'rollup';

// Access protected static methods via subclass for testing
class TestableRollupStrategy extends RollupBuildStrategy
{
	static testCreateEnvReplacePlugin(production: boolean)
	{
		return RollupBuildStrategy.createEnvReplacePlugin(production);
	}

	static testCreateNpmRemapPlugin(dependenciesRef?: string[])
	{
		return RollupBuildStrategy.createNpmRemapPlugin(dependenciesRef);
	}

	static testCreateOnWarningHandler()
	{
		return RollupBuildStrategy.createOnWarningHandler();
	}

	static testCreateVirtualEntryPlugin(entries: Record<string, string>)
	{
		return RollupBuildStrategy.createVirtualEntryPlugin(entries);
	}

	static testCalculateBundlesSize(output: any[])
	{
		return RollupBuildStrategy.calculateBundlesSize(output);
	}

	static testCreateTerserPlugin(options: import('terser').MinifyOptions = {})
	{
		return RollupBuildStrategy.createTerserPlugin(options);
	}

	static testGuessNamespace(dependency: string): string
	{
		return RollupBuildStrategy.guessNamespace(dependency);
	}

	static testMakeGlobals(dependencies: string[]): Record<string, string>
	{
		return RollupBuildStrategy.makeGlobals(dependencies);
	}
}

describe('RollupBuildStrategy', () => {
	describe('createEnvReplacePlugin', () => {
		it('should replace process.env.NODE_ENV with "production"', () => {
			const plugin = TestableRollupStrategy.testCreateEnvReplacePlugin(true);
			const result = (plugin as any).transform('if (process.env.NODE_ENV === "production") {}');

			assert.isNotNull(result);
			assert.include(result.code, '"production"');
			assert.notInclude(result.code, 'process.env.NODE_ENV');
		});

		it('should replace process.env.NODE_ENV with "development"', () => {
			const plugin = TestableRollupStrategy.testCreateEnvReplacePlugin(false);
			const result = (plugin as any).transform('if (process.env.NODE_ENV === "production") {}');

			assert.isNotNull(result);
			assert.include(result.code, '"development"');
		});

		it('should replace import.meta.env.PROD', () => {
			const plugin = TestableRollupStrategy.testCreateEnvReplacePlugin(true);
			const result = (plugin as any).transform('const isProd = import.meta.env.PROD;');

			assert.isNotNull(result);
			assert.include(result.code, 'true');
		});

		it('should replace import.meta.env.DEV', () => {
			const plugin = TestableRollupStrategy.testCreateEnvReplacePlugin(true);
			const result = (plugin as any).transform('const isDev = import.meta.env.DEV;');

			assert.isNotNull(result);
			assert.include(result.code, 'false');
		});

		it('should replace import.meta.env.MODE', () => {
			const plugin = TestableRollupStrategy.testCreateEnvReplacePlugin(false);
			const result = (plugin as any).transform('const mode = import.meta.env.MODE;');

			assert.isNotNull(result);
			assert.include(result.code, '"development"');
		});

		it('should return null when no env references found', () => {
			const plugin = TestableRollupStrategy.testCreateEnvReplacePlugin(true);
			const result = (plugin as any).transform('const x = 1;');

			assert.isNull(result);
		});

		it('should replace all occurrences', () => {
			const plugin = TestableRollupStrategy.testCreateEnvReplacePlugin(true);
			const result = (plugin as any).transform(
				'const a = import.meta.env.PROD; const b = import.meta.env.PROD;',
			);

			assert.isNotNull(result);
			assert.notInclude(result.code, 'import.meta.env.PROD');
			// Both should be replaced
			const trueCount = (result.code.match(/true/g) || []).length;
			assert.isAtLeast(trueCount, 2);
		});
	});

	describe('createNpmRemapPlugin', () => {
		it('should remap "vue" to "ui.vue3"', () => {
			const deps: string[] = [];
			const plugin = TestableRollupStrategy.testCreateNpmRemapPlugin(deps);
			const result = (plugin as any).resolveId('vue');

			assert.deepEqual(result, { id: 'ui.vue3', external: true });
			assert.include(deps, 'ui.vue3');
		});

		it('should return null for unknown packages', () => {
			const plugin = TestableRollupStrategy.testCreateNpmRemapPlugin();
			const result = (plugin as any).resolveId('lodash');

			assert.isNull(result);
		});

		it('should work without dependenciesRef', () => {
			const plugin = TestableRollupStrategy.testCreateNpmRemapPlugin();
			const result = (plugin as any).resolveId('vue');

			assert.deepEqual(result, { id: 'ui.vue3', external: true });
		});
	});

	describe('createOnWarningHandler', () => {
		it('should collect unresolved external imports as dependencies', () => {
			const { onWarning, dependenciesRef, warningsRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			onWarning(
				{ code: 'UNRESOLVED_IMPORT', exporter: 'main.core' } as RollupLog,
				() => {},
			);

			assert.include(dependenciesRef, 'main.core');
			assert.isEmpty(warningsRef);
		});

		it('should collect non-dependency warnings', () => {
			const { onWarning, dependenciesRef, warningsRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			// THIS_IS_UNDEFINED routes through the generic fallback into warningsRef.
			onWarning({ code: 'THIS_IS_UNDEFINED', message: 'this rewritten' } as RollupLog, () => {});

			assert.isEmpty(dependenciesRef);
			assert.lengthOf(warningsRef, 1);
			assert.equal(warningsRef[0].message, 'this rewritten');
		});

		it('should not treat relative imports as dependencies', () => {
			const { onWarning, dependenciesRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			onWarning(
				{ code: 'UNRESOLVED_IMPORT', exporter: './utils' } as RollupLog,
				() => {},
			);

			assert.isEmpty(dependenciesRef);
		});

		it('should queue direct CIRCULAR_DEPENDENCY warnings for post-build resolution', () => {
			// CIRCULAR_DEPENDENCY does not go into warningsRef synchronously anymore — we need to
			// open the source file and locate the offending `import` line, which is async. The
			// handler stashes the chain in pendingCircularRef and build()/generate() resolve it
			// into a BuildDiagnostic with a code frame afterwards.
			const { onWarning, warningsRef, pendingCircularRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			onWarning(
				{ code: 'CIRCULAR_DEPENDENCY', message: 'a -> b -> a', ids: ['/x/a.js', '/x/b.js', '/x/a.js'] } as RollupLog,
				() => {},
			);

			assert.isEmpty(warningsRef, 'CIRCULAR_DEPENDENCY no longer lands in warningsRef synchronously');
			assert.lengthOf(pendingCircularRef, 1);
			assert.deepEqual(pendingCircularRef[0], ['/x/a.js', '/x/b.js', '/x/a.js']);
		});

		it('should drop long (>3 ids) CIRCULAR_DEPENDENCY chains', () => {
			const { onWarning, warningsRef, pendingCircularRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			onWarning(
				{
					code: 'CIRCULAR_DEPENDENCY',
					message: 'a -> b -> c -> a',
					ids: ['/x/a.js', '/x/b.js', '/x/c.js', '/x/a.js'],
				} as RollupLog,
				() => {},
			);

			assert.isEmpty(warningsRef);
			assert.isEmpty(pendingCircularRef, 'Transitive cycles must be filtered out');
		});

		it('should map MISSING_EXPORT to CF1007', () => {
			const { onWarning, warningsRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			onWarning({ code: 'MISSING_EXPORT', message: '"foo" is not exported' } as RollupLog, () => {});

			assert.equal(warningsRef[0].code, CF.MISSING_EXPORT);
		});

		it('should map THIS_IS_UNDEFINED to CF1008', () => {
			const { onWarning, warningsRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			onWarning({ code: 'THIS_IS_UNDEFINED', message: 'this rewritten' } as RollupLog, () => {});

			assert.equal(warningsRef[0].code, CF.THIS_IS_UNDEFINED);
		});

		it('should map EVAL to CF1009', () => {
			const { onWarning, warningsRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			onWarning({ code: 'EVAL', message: 'Use of eval' } as RollupLog, () => {});

			assert.equal(warningsRef[0].code, CF.EVAL);
		});

		it('should map UNUSED_EXTERNAL_IMPORT to CF1011', () => {
			const { onWarning, warningsRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			onWarning({ code: 'UNUSED_EXTERNAL_IMPORT', message: '"foo" imported but unused' } as RollupLog, () => {});

			assert.equal(warningsRef[0].code, CF.UNUSED_EXTERNAL_IMPORT);
		});

		it('should map PLUGIN_WARNING to CF1014', () => {
			const { onWarning, warningsRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			onWarning({ code: 'PLUGIN_WARNING', message: 'Plugin issue' } as RollupLog, () => {});

			assert.equal(warningsRef[0].code, CF.PLUGIN_WARNING);
		});

		it('should map unknown warning codes to CF1099', () => {
			const { onWarning, warningsRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			onWarning({ code: 'SOME_FUTURE_CODE', message: 'Unknown warning' } as RollupLog, () => {});

			assert.equal(warningsRef[0].code, CF.UNKNOWN_BUILD_WARNING);
		});

		it('should map non-external UNRESOLVED_IMPORT to CF1012', () => {
			const { onWarning, warningsRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			onWarning(
				{ code: 'UNRESOLVED_IMPORT', exporter: './utils' } as RollupLog,
				() => {},
			);

			assert.lengthOf(warningsRef, 1);
			assert.equal(warningsRef[0].code, CF.UNRESOLVED_IMPORT);
		});
	});

	describe('createVirtualEntryPlugin', () => {
		it('should resolve virtual entry modules', () => {
			const plugin = TestableRollupStrategy.testCreateVirtualEntryPlugin({
				'entry.js': 'export default 42;',
			});

			const resolveResult = (plugin as any).resolveId('entry.js');
			assert.equal(resolveResult, 'entry.js');

			const loadResult = (plugin as any).load('entry.js');
			assert.equal(loadResult, 'export default 42;');
		});

		it('should return null for unknown modules', () => {
			const plugin = TestableRollupStrategy.testCreateVirtualEntryPlugin({
				'entry.js': 'code',
			});

			assert.isNull((plugin as any).resolveId('other.js'));
			assert.isNull((plugin as any).load('other.js'));
		});
	});

	describe('createTerserPlugin', () => {
		it('should minify JavaScript code', async () => {
			const plugin = TestableRollupStrategy.testCreateTerserPlugin();
			const chunk = { fileName: 'app.js' };
			const code = 'const message = "hello";\nconsole.log(message);\n';

			const result = await (plugin as any).renderChunk(code, chunk);

			assert.isNotNull(result);
			assert.isString(result.code);
			assert.isBelow(result.code.length, code.length);
		});

		it('should preserve functionality after minification', async () => {
			const plugin = TestableRollupStrategy.testCreateTerserPlugin();
			const chunk = { fileName: 'app.js' };
			const code = 'function add(a, b) { return a + b; }\n';

			const result = await (plugin as any).renderChunk(code, chunk);

			assert.include(result.code, 'return');
		});

		it('should handle empty options', async () => {
			const plugin = TestableRollupStrategy.testCreateTerserPlugin({});
			const chunk = { fileName: 'app.js' };
			const code = 'const x = 1;\n';

			const result = await (plugin as any).renderChunk(code, chunk);

			assert.isNotNull(result);
			assert.isString(result.code);
		});
	});

	describe('calculateBundlesSize', () => {
		it('should calculate chunk sizes', () => {
			const output = [
				{ type: 'chunk', fileName: 'app.js', code: 'var x = 1;' },
				{ type: 'asset', fileName: 'app.css', source: '.a { color: red; }' },
			];

			const sizes = TestableRollupStrategy.testCalculateBundlesSize(output);

			assert.equal(sizes.length, 2);
			assert.equal(sizes[0].fileName, 'app.js');
			assert.equal(sizes[0].size, Buffer.byteLength('var x = 1;'));
			assert.equal(sizes[1].fileName, 'app.css');
			assert.equal(sizes[1].size, Buffer.byteLength('.a { color: red; }'));
		});

		it('should handle empty output', () => {
			const sizes = TestableRollupStrategy.testCalculateBundlesSize([]);
			assert.deepEqual(sizes, []);
		});

		it('should calculate UTF-8 sizes correctly', () => {
			const output = [
				{ type: 'chunk', fileName: 'app.js', code: 'const кириллица = 1;' },
			];

			const sizes = TestableRollupStrategy.testCalculateBundlesSize(output);
			assert.equal(sizes[0].size, Buffer.byteLength('const кириллица = 1;', 'utf8'));
		});
	});

	describe('guessNamespace', () => {
		let sandbox: sinon.SinonSandbox;
		let tmpDir: string;

		beforeEach(() => {
			sandbox = sinon.createSandbox();
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-test-'));
		});

		afterEach(() => {
			sandbox.restore();
			fs.rmSync(tmpDir, { recursive: true });
		});

		it('should return window when root is not set', () => {
			sandbox.stub(Environment, 'getRoot').returns(null);

			assert.equal(TestableRollupStrategy.testGuessNamespace('rest.client'), 'window');
		});

		it('should return BX in source environment', () => {
			sandbox.stub(Environment, 'getRoot').returns(tmpDir);
			sandbox.stub(Environment, 'getType').returns('source');

			assert.equal(TestableRollupStrategy.testGuessNamespace('rest.client'), 'BX');
		});

		it('should return BX for extensions in bitrix/js in project environment', () => {
			fs.mkdirSync(path.join(tmpDir, 'bitrix', 'js', 'rest', 'client'), { recursive: true });

			sandbox.stub(Environment, 'getRoot').returns(tmpDir);
			sandbox.stub(Environment, 'getType').returns('project');

			assert.equal(TestableRollupStrategy.testGuessNamespace('rest.client'), 'BX');
		});

		it('should return window for extensions not in bitrix/js in project environment', () => {
			sandbox.stub(Environment, 'getRoot').returns(tmpDir);
			sandbox.stub(Environment, 'getType').returns('project');

			assert.equal(TestableRollupStrategy.testGuessNamespace('vendor.utils'), 'window');
		});

		it('should return window in unknown environment', () => {
			sandbox.stub(Environment, 'getRoot').returns(tmpDir);
			sandbox.stub(Environment, 'getType').returns('unknown');

			assert.equal(TestableRollupStrategy.testGuessNamespace('some.ext'), 'window');
		});
	});

	describe('makeGlobals', () => {
		let sandbox: sinon.SinonSandbox;

		beforeEach(() => {
			sandbox = sinon.createSandbox();
		});

		afterEach(() => {
			sandbox.restore();
		});

		it('should use BX fallback for unresolved dependencies in source environment', () => {
			sandbox.stub(Environment, 'getRoot').returns('/path/to/modules');
			sandbox.stub(Environment, 'getType').returns('source');

			const globals = TestableRollupStrategy.testMakeGlobals(['rest.client', 'pull.client']);

			assert.equal(globals['rest.client'], 'BX');
			assert.equal(globals['pull.client'], 'BX');
		});

		it('should use window fallback for unresolved dependencies in project without bitrix path', () => {
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-test-'));
			sandbox.stub(Environment, 'getRoot').returns(tmpDir);
			sandbox.stub(Environment, 'getType').returns('project');

			const globals = TestableRollupStrategy.testMakeGlobals(['vendor.utils']);

			assert.equal(globals['vendor.utils'], 'window');
			fs.rmSync(tmpDir, { recursive: true });
		});
	});
});
