import { describe, it } from 'mocha';
import { assert } from 'chai';

import { RollupBuildStrategy } from '../../../src/modules/engines/build/rollup/rollup-strategy';

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

	static testCreateOxcMinifyPlugin(options: import('oxc-minify').MinifyOptions = {})
	{
		return RollupBuildStrategy.createOxcMinifyPlugin(options);
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

			onWarning({ code: 'CIRCULAR_DEPENDENCY', message: 'Circular' } as RollupLog, () => {});

			assert.isEmpty(dependenciesRef);
			assert.lengthOf(warningsRef, 1);
			assert.equal(warningsRef[0].message, 'Circular');
		});

		it('should not treat relative imports as dependencies', () => {
			const { onWarning, dependenciesRef } = TestableRollupStrategy.testCreateOnWarningHandler();

			onWarning(
				{ code: 'UNRESOLVED_IMPORT', exporter: './utils' } as RollupLog,
				() => {},
			);

			assert.isEmpty(dependenciesRef);
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

	describe('createOxcMinifyPlugin', () => {
		it('should minify JavaScript code', async () => {
			const plugin = TestableRollupStrategy.testCreateOxcMinifyPlugin();
			const chunk = { fileName: 'app.js' };
			const code = 'const message = "hello";\nconsole.log(message);\n';

			const result = await (plugin as any).renderChunk(code, chunk);

			assert.isNotNull(result);
			assert.isString(result.code);
			assert.isBelow(result.code.length, code.length);
		});

		it('should preserve functionality after minification', async () => {
			const plugin = TestableRollupStrategy.testCreateOxcMinifyPlugin();
			const chunk = { fileName: 'app.js' };
			const code = 'function add(a, b) { return a + b; }\n';

			const result = await (plugin as any).renderChunk(code, chunk);

			assert.include(result.code, 'return');
		});

		it('should handle empty options', async () => {
			const plugin = TestableRollupStrategy.testCreateOxcMinifyPlugin({});
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
});
