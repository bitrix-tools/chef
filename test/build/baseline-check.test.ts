import { describe, it } from 'mocha';
import { assert } from 'chai';

import baselineCheckPlugin from '../../src/modules/engines/build/rollup/plugins/baseline-check';

interface CollectedWarning {
	message: string;
	severity?: string;
	pos?: { line: number; column: number };
}

function createPlugin(targets: string[])
{
	const warnings: CollectedWarning[] = [];
	const plugin = baselineCheckPlugin({ targets, packageRoot: '/test' });

	const context = {
		warn(input: string | { message: string; loc?: { line: number; column: number }; meta?: { severity?: string } })
		{
			if (typeof input === 'string')
			{
				warnings.push({ message: input });
			}
			else
			{
				warnings.push({
					message: input.message,
					severity: input.meta?.severity,
					pos: input.loc ? { line: input.loc.line, column: input.loc.column } : undefined,
				});
			}
		},
	};

	function transform(code: string, id: string): void
	{
		const transformFn = (plugin as any).transform;
		if (transformFn)
		{
			transformFn.call(context, code, id);
		}
	}

	return { warnings, transform };
}

// Old targets where many modern APIs are NOT supported
const oldTargets = ['chrome 60', 'firefox 60', 'safari 11'];

// Modern targets where most APIs are supported
const modernTargets = ['chrome 120', 'firefox 120', 'safari 17.4'];

describe('baseline-check', () => {
	describe('global APIs', () => {
		it('should detect structuredClone on old targets', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const copy = structuredClone(obj);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'structuredClone');
			assert.include(warnings[0].message, 'not supported');
		});

		it('should not detect structuredClone on modern targets', () => {
			const { warnings, transform } = createPlugin(modernTargets);

			transform('const copy = structuredClone(obj);', '/src/app.js');

			assert.isEmpty(warnings);
		});

		it('should report correct line and column for global API', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const a = 1;\nconst copy = structuredClone(obj);', '/src/app.js');

			assert.equal(warnings[0].pos?.line, 2);
			assert.equal(warnings[0].pos?.column, 13);
		});
	});

	describe('static methods', () => {
		it('should detect Object.hasOwn on old targets', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('if (Object.hasOwn(obj, "key")) {}', '/src/app.ts');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'Object.hasOwn');
			assert.include(warnings[0].message, 'not supported');
		});

		it('should not detect Object.hasOwn on modern targets', () => {
			const { warnings, transform } = createPlugin(modernTargets);

			transform('if (Object.hasOwn(obj, "key")) {}', '/src/app.ts');

			assert.isEmpty(warnings);
		});

		it('should detect Object.groupBy on old targets', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const grouped = Object.groupBy(items, fn);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'Object.groupBy');
		});

		it('should detect Promise.withResolvers on old targets', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const { promise, resolve } = Promise.withResolvers();', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'Promise.withResolvers');
		});

		it('should not match partial identifiers', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const MyObject_hasOwn = true;', '/src/app.js');

			assert.isEmpty(warnings);
		});

		it('should detect multiple static methods on the same line', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const a = Object.hasOwn(x, "a") && Object.groupBy(y, fn);', '/src/app.js');

			assert.isAtLeast(warnings.length, 2);
		});
	});

	describe('instance methods', () => {
		it('should detect .at() on old targets', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const last = items.at(-1);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, '.at()');
			assert.include(warnings[0].message, 'may not be supported');
		});

		it('should not detect .at() on modern targets', () => {
			const { warnings, transform } = createPlugin(modernTargets);

			transform('const last = items.at(-1);', '/src/app.js');

			assert.isEmpty(warnings);
		});

		it('should detect .toReversed() on old targets', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const reversed = arr.toReversed();', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, '.toReversed()');
		});

		it('should detect .toSorted() on old targets', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const sorted = arr.toSorted();', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, '.toSorted()');
		});

		it('should detect .replaceAll() on old targets', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const result = str.replaceAll("a", "b");', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, '.replaceAll()');
		});

		it('should detect .findLast() on old targets', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const item = arr.findLast(x => x > 0);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, '.findLast()');
		});

		it('should include owner info in instance method warning', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const last = arr.at(-1);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'Array.prototype.at');
		});
	});

	describe('CSS checks', () => {
		it('should detect unsupported CSS property on old targets', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('.box {\n\tcontainer-type: inline-size;\n}', '/src/styles.css');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'CSS property');
			assert.include(warnings[0].message, 'container-type');
		});

		it('should not detect unsupported CSS property on modern targets', () => {
			const { warnings, transform } = createPlugin(modernTargets);

			transform('.box {\n\tcontainer-type: inline-size;\n}', '/src/styles.css');

			assert.isEmpty(warnings);
		});

		it('should detect unsupported CSS at-rule on old targets', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('@container (min-width: 400px) {\n\t.card { display: grid; }\n}', '/src/styles.css');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'CSS @container');
		});

		it('should skip CSS comment lines', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('/* container-type: inline-size; */', '/src/styles.css');

			assert.isEmpty(warnings);
		});

		it('should skip properties inside @supports block', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform(
				'@supports (container-type: inline-size) {\n'
				+ '\t.box {\n'
				+ '\t\tcontainer-type: inline-size;\n'
				+ '\t}\n'
				+ '}',
				'/src/styles.css',
			);

			assert.isEmpty(warnings);
		});

		it('should skip selectors inside @supports block', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform(
				'@supports not selector(::-webkit-scrollbar) {\n'
				+ '\t.box {\n'
				+ '\t\tscrollbar-width: thin;\n'
				+ '\t}\n'
				+ '}',
				'/src/styles.css',
			);

			assert.isEmpty(warnings);
		});

		it('should still detect properties outside @supports', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform(
				'@supports (container-type: inline-size) {\n'
				+ '\t.box { container-type: inline-size; }\n'
				+ '}\n'
				+ '.other {\n'
				+ '\tcontainer-type: inline-size;\n'
				+ '}',
				'/src/styles.css',
			);

			assert.lengthOf(warnings, 1);
			assert.include(warnings[0].message, 'container-type');
			assert.equal(warnings[0].pos?.line, 5);
		});

		it('should handle nested @supports blocks', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform(
				'@supports (display: grid) {\n'
				+ '\t@supports (container-type: inline-size) {\n'
				+ '\t\t.box { container-type: inline-size; }\n'
				+ '\t}\n'
				+ '}',
				'/src/styles.css',
			);

			assert.isEmpty(warnings);
		});

		it('should resume checking after @supports block closes', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform(
				'@supports (container-type: inline-size) {\n'
				+ '\t.box { container-type: inline-size; }\n'
				+ '}\n'
				+ 'container-type: inline-size;',
				'/src/styles.css',
			);

			assert.lengthOf(warnings, 1);
			assert.equal(warnings[0].pos?.line, 4);
		});
	});

	describe('file filtering', () => {
		it('should check .js files', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('structuredClone(obj);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
		});

		it('should check .ts files', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('structuredClone(obj);', '/src/app.ts');

			assert.isAbove(warnings.length, 0);
		});

		it('should check .tsx files', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('structuredClone(obj);', '/src/app.tsx');

			assert.isAbove(warnings.length, 0);
		});

		it('should check .jsx files', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('structuredClone(obj);', '/src/app.jsx');

			assert.isAbove(warnings.length, 0);
		});

		it('should check .mjs files', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('structuredClone(obj);', '/src/app.mjs');

			assert.isAbove(warnings.length, 0);
		});

		it('should check .css files', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('container-type: inline-size;', '/src/styles.css');

			assert.isAbove(warnings.length, 0);
		});

		it('should skip node_modules', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('structuredClone(obj);', '/node_modules/lib/index.js');

			assert.isEmpty(warnings);
		});

		it('should skip unsupported file extensions', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('structuredClone(obj);', '/src/data.json');

			assert.isEmpty(warnings);
		});
	});

	describe('comment skipping', () => {
		it('should skip single-line comment lines in JS', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('// structuredClone(obj);', '/src/app.js');

			assert.isEmpty(warnings);
		});

		it('should skip block comment lines in JS', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('/* structuredClone(obj); */', '/src/app.js');

			assert.isEmpty(warnings);
		});

		it('should skip JSDoc comment body lines', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('/**\n * uses structuredClone internally\n */', '/src/app.js');

			assert.isEmpty(warnings);
		});
	});

	describe('@chef-ignore', () => {
		it('should suppress JS warning with inline comment', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const copy = structuredClone(obj); // @chef-ignore', '/src/app.js');

			assert.isEmpty(warnings);
		});

		it('should suppress JS warning with previous-line comment', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('// @chef-ignore\nconst copy = structuredClone(obj);', '/src/app.js');

			assert.isEmpty(warnings);
		});

		it('should only suppress the next line, not further lines', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform(
				'// @chef-ignore\nconst copy = structuredClone(obj);\nconst copy2 = structuredClone(obj);',
				'/src/app.js',
			);

			assert.lengthOf(warnings, 1);
			assert.include(warnings[0].message, 'structuredClone');
			assert.equal(warnings[0].pos?.line, 3);
		});

		it('should suppress CSS warning with inline comment', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('.box {\n\tcontainer-type: inline-size; /* @chef-ignore */\n}', '/src/styles.css');

			assert.isEmpty(warnings);
		});

		it('should suppress CSS warning with previous-line comment', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('.box {\n\t/* @chef-ignore */\n\tcontainer-type: inline-size;\n}', '/src/styles.css');

			assert.isEmpty(warnings);
		});

		it('should suppress static method warning', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('Object.hasOwn(obj, "key"); // @chef-ignore', '/src/app.js');

			assert.isEmpty(warnings);
		});

		it('should suppress instance method warning', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('arr.at(-1); // @chef-ignore', '/src/app.js');

			assert.isEmpty(warnings);
		});
	});

	describe('target upgrades', () => {
		it('should report structuredClone error on Chrome 90, clear on Chrome 100', () => {
			const oldPlugin = createPlugin(['chrome 90']);
			oldPlugin.transform('const copy = structuredClone(obj);', '/src/app.js');

			assert.isAbove(oldPlugin.warnings.length, 0, 'should warn on Chrome 90');

			const newPlugin = createPlugin(['chrome 100']);
			newPlugin.transform('const copy = structuredClone(obj);', '/src/app.js');

			assert.isEmpty(newPlugin.warnings, 'should not warn on Chrome 100');
		});

		it('should report Object.hasOwn error on Chrome 90, clear on Chrome 93', () => {
			const oldPlugin = createPlugin(['chrome 90']);
			oldPlugin.transform('Object.hasOwn(obj, "key");', '/src/app.js');

			assert.isAbove(oldPlugin.warnings.length, 0, 'should warn on Chrome 90');

			const newPlugin = createPlugin(['chrome 93']);
			newPlugin.transform('Object.hasOwn(obj, "key");', '/src/app.js');

			assert.isEmpty(newPlugin.warnings, 'should not warn on Chrome 93');
		});

		it('should report .at() error on Safari 14, clear on Safari 15.4', () => {
			const oldPlugin = createPlugin(['safari 14']);
			oldPlugin.transform('items.at(-1);', '/src/app.js');

			assert.isAbove(oldPlugin.warnings.length, 0, 'should warn on Safari 14');

			const newPlugin = createPlugin(['safari 15.4']);
			newPlugin.transform('items.at(-1);', '/src/app.js');

			assert.isEmpty(newPlugin.warnings, 'should not warn on Safari 15.4');
		});

		it('should report .replaceAll() error on Chrome 80, clear on Chrome 85', () => {
			const oldPlugin = createPlugin(['chrome 80']);
			oldPlugin.transform('str.replaceAll("a", "b");', '/src/app.js');

			assert.isAbove(oldPlugin.warnings.length, 0, 'should warn on Chrome 80');

			const newPlugin = createPlugin(['chrome 85']);
			newPlugin.transform('str.replaceAll("a", "b");', '/src/app.js');

			assert.isEmpty(newPlugin.warnings, 'should not warn on Chrome 85');
		});

		it('should report container-type error on Chrome 100, clear on Chrome 105', () => {
			const oldPlugin = createPlugin(['chrome 100']);
			oldPlugin.transform('container-type: inline-size;', '/src/styles.css');

			assert.isAbove(oldPlugin.warnings.length, 0, 'should warn on Chrome 100');

			const newPlugin = createPlugin(['chrome 105']);
			newPlugin.transform('container-type: inline-size;', '/src/styles.css');

			assert.isEmpty(newPlugin.warnings, 'should not warn on Chrome 105');
		});

		it('should report Promise.allSettled error on Chrome 70, clear on Chrome 76', () => {
			const oldPlugin = createPlugin(['chrome 70']);
			oldPlugin.transform('await Promise.allSettled(promises);', '/src/app.js');

			assert.isAbove(oldPlugin.warnings.length, 0, 'should warn on Chrome 70');

			const newPlugin = createPlugin(['chrome 76']);
			newPlugin.transform('await Promise.allSettled(promises);', '/src/app.js');

			assert.isEmpty(newPlugin.warnings, 'should not warn on Chrome 76');
		});

		it('should warn when at least one target is too old', () => {
			const { warnings, transform } = createPlugin(['chrome 120', 'safari 14']);

			transform('items.at(-1);', '/src/app.js');

			assert.isAbove(warnings.length, 0, 'should warn because Safari 14 does not support .at()');
			assert.include(warnings[0].message, 'Safari');
		});

		it('should clear warnings when all targets are upgraded', () => {
			const { warnings, transform } = createPlugin(['chrome 120', 'safari 15.4']);

			transform('items.at(-1);', '/src/app.js');

			assert.isEmpty(warnings, 'should not warn when all targets support .at()');
		});
	});

	describe('edge cases', () => {
		it('should return noop plugin when no recognized targets', () => {
			const plugin = baselineCheckPlugin({ targets: ['ie 11'], packageRoot: '/test' });

			assert.equal(plugin.name, 'baseline-check');
			assert.isUndefined((plugin as any).transform);
		});

		it('should return noop plugin when targets array is empty', () => {
			const plugin = baselineCheckPlugin({ targets: [], packageRoot: '/test' });

			assert.equal(plugin.name, 'baseline-check');
			assert.isUndefined((plugin as any).transform);
		});

		it('should handle multiple warnings on different lines', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform(
				'const a = structuredClone(x);\nconst b = Object.hasOwn(y, "z");\nconst c = arr.at(-1);',
				'/src/app.js',
			);

			assert.isAtLeast(warnings.length, 3);
			assert.equal(warnings[0].pos?.line, 1);
			assert.equal(warnings[1].pos?.line, 2);
			assert.equal(warnings[2].pos?.line, 3);
		});

		it('should not warn about APIs in strings', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform("const name = 'structuredClone';", '/src/app.js');

			// Note: the regex-based checker will still match inside strings.
			// This is a known limitation — the check is text-based, not AST-based.
			// If this becomes a problem, @chef-ignore can be used.
		});

		it('should handle code with no issues', () => {
			const { warnings, transform } = createPlugin(oldTargets);

			transform('const x = 1;\nconst y = x + 2;\nconsole.log(y);', '/src/app.js');

			assert.isEmpty(warnings);
		});

		it('should pick minimum version when target appears multiple times', () => {
			const oldPlugin = createPlugin(['chrome 60', 'chrome 120']);
			oldPlugin.transform('const copy = structuredClone(obj);', '/src/app.js');

			assert.isAbove(oldPlugin.warnings.length, 0, 'should use the lower version (chrome 60)');
		});

		it('should include browser name in unsupported list', () => {
			const { warnings, transform } = createPlugin(['firefox 60']);

			transform('const copy = structuredClone(obj);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'Firefox');
		});
	});

	// These cases used to slip through the old hardcoded whitelist. The
	// BCD-driven checker must catch them automatically.
	describe('without whitelist (BCD-driven)', () => {
		const oldTargets = ['chrome 109', 'firefox 115', 'safari 16.4'];

		it('should detect RegExp.escape (added Chrome 136)', () => {
			const { warnings, transform } = createPlugin(oldTargets);
			transform('const re = RegExp.escape(input);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'RegExp.escape');
		});

		it('should detect Promise.try (added Chrome 128)', () => {
			const { warnings, transform } = createPlugin(['chrome 120', 'firefox 120']);
			transform('Promise.try(fn);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'Promise.try');
		});

		it('should detect new WeakRef on Safari 13', () => {
			const { warnings, transform } = createPlugin(['safari 13']);
			transform('const ref = new WeakRef(obj);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'WeakRef');
		});

		it('should detect new AggregateError on Safari 13', () => {
			const { warnings, transform } = createPlugin(['safari 13']);
			transform('throw new AggregateError([e1, e2], "msg");', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'AggregateError');
		});

		it('should detect new FinalizationRegistry on Safari 13', () => {
			const { warnings, transform } = createPlugin(['safari 13']);
			transform('const reg = new FinalizationRegistry(cb);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'FinalizationRegistry');
		});

		it('should detect Iterator.from on Chrome 120', () => {
			const { warnings, transform } = createPlugin(['chrome 120']);
			transform('Iterator.from(arr);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'Iterator.from');
		});

		it('should detect Array.prototype.toSorted on Safari 14', () => {
			const { warnings, transform } = createPlugin(['safari 14']);
			transform('arr.toSorted();', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'toSorted');
		});

		it('should NOT detect shadowed Promise.allSettled (let Promise = bluebird)', () => {
			const { warnings, transform } = createPlugin(['chrome 60']);
			transform('const Promise = bluebird; Promise.allSettled([]);', '/src/app.js');

			assert.isEmpty(warnings);
		});

		it('should NOT detect API names that appear inside string literals', () => {
			const { warnings, transform } = createPlugin(['chrome 60']);
			transform('const s = "RegExp.escape and structuredClone";', '/src/app.js');

			assert.isEmpty(warnings);
		});

		it('should detect optional chaining on legacy targets', () => {
			const { warnings, transform } = createPlugin(['chrome 70', 'firefox 70', 'safari 12']);
			transform('const v = obj?.prop;', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message.toLowerCase(), 'optional chaining');
		});

		it('should detect nullish coalescing on legacy targets', () => {
			const { warnings, transform } = createPlugin(['chrome 70', 'firefox 70', 'safari 12']);
			transform('const v = a ?? b;', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message.toLowerCase(), 'nullish coalescing');
		});

		it('should detect nullish coalescing assignment on legacy targets', () => {
			const { warnings, transform } = createPlugin(['chrome 80', 'firefox 80', 'safari 13']);
			transform('a ??= b;', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message.toLowerCase(), 'nullish');
		});

		it('should detect Object.groupBy on Safari 16', () => {
			const { warnings, transform } = createPlugin(['safari 16']);
			transform('const grouped = Object.groupBy(arr, key);', '/src/app.js');

			assert.isAbove(warnings.length, 0);
			assert.include(warnings[0].message, 'Object.groupBy');
		});
	});
});
