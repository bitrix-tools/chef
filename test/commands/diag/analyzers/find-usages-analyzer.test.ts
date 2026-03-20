import { assert } from 'chai';

import { findJsUsages, findPhpUsages } from '../../../../src/commands/diag/analyzers/find-usages-analyzer';

import type { UsageLocation } from '../../../../src/commands/diag/analyzers/find-usages-analyzer';

function collect(
	fn: typeof findJsUsages | typeof findPhpUsages,
	content: string,
	extensionName: string,
	globals: Set<string> = new Set(),
	file = 'test.js',
): UsageLocation[]
{
	const usages: UsageLocation[] = [];
	fn(content, file, extensionName, globals, usages);
	return usages;
}

describe('findJsUsages', () => {
	it('should find ESM import on single line', () => {
		const content = `import { Button } from 'ui.buttons';`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-import');
		assert.equal(usages[0].line, 1);
	});

	it('should find BX.loadExtension on single line', () => {
		const content = `BX.loadExtension('ui.buttons');`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-load-extension');
	});

	it('should find BX.loadExt on single line', () => {
		const content = `BX.loadExt('ui.buttons');`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-load-extension');
	});

	it('should find Runtime.loadExtension on single line', () => {
		const content = `Runtime.loadExtension('ui.buttons');`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-load-extension');
	});

	it('should find BX.loadExtension with multiline array argument', () => {
		const content = [
			`BX.loadExtension([`,
			`  'main.core',`,
			`  'ui.buttons',`,
			`  'ui.forms'`,
			`]);`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-load-extension');
		assert.equal(usages[0].line, 3);
		assert.include(usages[0].content, 'ui.buttons');
	});

	it('should find Runtime.loadExtension with multiline argument', () => {
		const content = [
			`Runtime.loadExtension(`,
			`  'ui.buttons'`,
			`);`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-load-extension');
		assert.equal(usages[0].line, 2);
	});

	it('should find BX.loadExtension with name on same line and multiline call', () => {
		const content = [
			`BX.loadExtension('ui.buttons',`,
			`  'main.core'`,
			`);`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-load-extension');
		assert.equal(usages[0].line, 1);
	});

	it('should find namespace access via exported globals', () => {
		const content = `const btn = new BX.UI.Button();`;
		const globals = new Set(['BX.UI.Button']);
		const usages = collect(findJsUsages, content, 'ui.buttons', globals);

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-namespace');
	});

	it('should not find namespace access for non-matching globals', () => {
		const content = `const form = new BX.UI.Form();`;
		const globals = new Set(['BX.UI.Button']);
		const usages = collect(findJsUsages, content, 'ui.buttons', globals);

		assert.equal(usages.length, 0);
	});

	it('should not match partial global names', () => {
		const content = `const color = BX.UI.ButtonColor.PRIMARY;`;
		const globals = new Set(['BX.UI.Button']);
		const usages = collect(findJsUsages, content, 'ui.buttons', globals);

		// BX.UI.Button should not match BX.UI.ButtonColor (word boundary)
		assert.equal(usages.length, 0);
	});

	it('should ignore comments', () => {
		const content = [
			`// import { Button } from 'ui.buttons';`,
			`/* BX.loadExtension('ui.buttons'); */`,
			`const x = 1;`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.buttons');
		assert.equal(usages.length, 0);
	});

	it('should ignore extension name in block comment spanning multiple lines', () => {
		const content = [
			`/*`,
			` * import { Button } from 'ui.buttons';`,
			` */`,
			`const x = 1;`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.buttons');
		assert.equal(usages.length, 0);
	});

	it('should not match extension name without quotes outside of loadExtension', () => {
		const content = `const ui.buttons = true;`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 0);
	});

	it('should find multiple usages in one file', () => {
		const content = [
			`import { Button } from 'ui.buttons';`,
			`BX.loadExtension('ui.buttons');`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.buttons');
		assert.equal(usages.length, 2);
		assert.equal(usages[0].type, 'js-import');
		assert.equal(usages[1].type, 'js-load-extension');
	});
});

describe('findPhpUsages', () => {
	it('should find Extension::load on single line', () => {
		const content = `Extension::load('ui.buttons');`;
		const usages = collect(findPhpUsages, content, 'ui.buttons', new Set(), 'test.php');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'php-extension-load');
	});

	it('should find fully qualified Extension::load on single line', () => {
		const content = `\\Bitrix\\Main\\UI\\Extension::load('ui.buttons');`;
		const usages = collect(findPhpUsages, content, 'ui.buttons', new Set(), 'test.php');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'php-extension-load');
	});

	it('should find Extension::load with multiline array argument', () => {
		const content = [
			`\\Bitrix\\Main\\UI\\Extension::load([`,
			`  'bizproc.automation',`,
			`  'ui.buttons',`,
			`  'ui.hint',`,
			`]);`,
		].join('\n');

		const usages = collect(findPhpUsages, content, 'ui.buttons', new Set(), 'test.php');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'php-extension-load');
		assert.equal(usages[0].line, 3);
		assert.include(usages[0].content, 'ui.buttons');
	});

	it('should find Extension::load with name on opening line', () => {
		const content = [
			`Extension::load(['ui.buttons',`,
			`  'main.core'`,
			`]);`,
		].join('\n');

		const usages = collect(findPhpUsages, content, 'ui.buttons', new Set(), 'test.php');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'php-extension-load');
		assert.equal(usages[0].line, 1);
	});

	it('should find CJSCore::Init on single line', () => {
		const content = `CJSCore::Init(['ui.buttons']);`;
		const usages = collect(findPhpUsages, content, 'ui.buttons', new Set(), 'test.php');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'php-cjscore');
	});

	it('should find CJSCore::Init with multiline array argument', () => {
		const content = [
			`CJSCore::Init([`,
			`  'ui.buttons',`,
			`  'main.core'`,
			`]);`,
		].join('\n');

		const usages = collect(findPhpUsages, content, 'ui.buttons', new Set(), 'test.php');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'php-cjscore');
		assert.equal(usages[0].line, 2);
	});

	it('should find config.php rel usage', () => {
		const content = `'rel' => ['ui.buttons', 'main.core'],`;
		const usages = collect(findPhpUsages, content, 'ui.buttons', new Set(), '/path/to/config.php');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'config-rel');
	});

	it('should find namespace access in inline JS within PHP', () => {
		const content = `<script>var btn = new BX.UI.Button();</script>`;
		const globals = new Set(['BX.UI.Button']);
		const usages = collect(findPhpUsages, content, 'ui.buttons', globals, 'test.php');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-namespace');
	});

	it('should ignore PHP comments', () => {
		const content = [
			`// Extension::load('ui.buttons');`,
			`# Extension::load('ui.buttons');`,
			`/* CJSCore::Init(['ui.buttons']); */`,
		].join('\n');

		const usages = collect(findPhpUsages, content, 'ui.buttons', new Set(), 'test.php');
		assert.equal(usages.length, 0);
	});

	it('should ignore block comment spanning multiple lines', () => {
		const content = [
			`/*`,
			`Extension::load('ui.buttons');`,
			`*/`,
		].join('\n');

		const usages = collect(findPhpUsages, content, 'ui.buttons', new Set(), 'test.php');
		assert.equal(usages.length, 0);
	});

	it('should not match extension name in regular PHP code outside known patterns', () => {
		const content = `$ext = 'ui.buttons';`;
		const usages = collect(findPhpUsages, content, 'ui.buttons', new Set(), 'test.php');

		assert.equal(usages.length, 0);
	});

	it('should handle nested parentheses in multiline Extension::load', () => {
		const content = [
			`Extension::load(array(`,
			`  'ui.buttons',`,
			`  'main.core'`,
			`));`,
		].join('\n');

		const usages = collect(findPhpUsages, content, 'ui.buttons', new Set(), 'test.php');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'php-extension-load');
		assert.equal(usages[0].line, 2);
	});

	it('should find multiple extensions in same multiline call', () => {
		const content = [
			`Extension::load([`,
			`  'ui.buttons',`,
			`  'main.core',`,
			`]);`,
		].join('\n');

		const buttonsUsages = collect(findPhpUsages, content, 'ui.buttons', new Set(), 'test.php');
		const coreUsages = collect(findPhpUsages, content, 'main.core', new Set(), 'test.php');

		assert.equal(buttonsUsages.length, 1);
		assert.equal(coreUsages.length, 1);
		assert.equal(buttonsUsages[0].line, 2);
		assert.equal(coreUsages[0].line, 3);
	});
});
