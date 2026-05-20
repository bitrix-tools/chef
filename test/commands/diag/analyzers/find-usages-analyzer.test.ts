import { assert } from 'chai';

import {
	findJsUsages,
	findPhpUsages,
	findPhpLoaders,
	findJsUsagesInPhp,
} from '../../../../src/commands/diag/analyzers/find-usages-analyzer';

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

	it('should find side-effect import without bindings', () => {
		const content = `import 'ui.buttons';`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-import');
	});

	it('should find default import', () => {
		const content = `import Buttons from 'ui.buttons';`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-import');
	});

	it('should find namespace import', () => {
		const content = `import * as Buttons from 'ui.buttons';`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-import');
	});

	it('should find re-export from extension', () => {
		const content = `export { Button } from 'ui.buttons';`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-import');
	});

	it('should find export * from extension', () => {
		const content = `export * from 'ui.buttons';`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-import');
	});

	it('should find dynamic import', () => {
		const content = `const m = await import('ui.buttons');`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-import-dynamic');
	});

	it('should not match substring when names are similar (loadExtension array)', () => {
		const content = [
			`BX.loadExtension([`,
			`  'ui.buttons.extended',`,
			`  'ui.buttons.icon-set',`,
			`]);`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.buttons');
		assert.equal(usages.length, 0);
	});

	it('should not match substring when names are similar (import)', () => {
		const content = `import { X } from 'ui.buttons.extended';`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 0);
	});

	it('should not be confused by parens inside string arguments', () => {
		const content = [
			`BX.loadExtension('ui.buttons');`,
			`doStuff('(', ')');`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.buttons');
		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-load-extension');
		assert.equal(usages[0].line, 1);
	});

	it('should handle TypeScript syntax', () => {
		const content = [
			`import type { Button } from 'ui.buttons';`,
			`function take<T extends string>(x: T): void { BX.loadExtension('ui.buttons'); }`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.buttons', new Set(), 'test.ts');
		assert.equal(usages.length, 2);
		assert.equal(usages[0].type, 'js-import');
		assert.equal(usages[1].type, 'js-load-extension');
	});

	it('should handle JSX', () => {
		const content = [
			`import { Button } from 'ui.buttons';`,
			`const el = <Button label="hi" />;`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.buttons', new Set(), 'test.jsx');
		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-import');
	});

	it('should find namespace access in nested expression', () => {
		const content = `const tone = new BX.UI.Button({ color: BX.UI.Button.Color.PRIMARY });`;
		const globals = new Set(['BX.UI.Button']);
		const usages = collect(findJsUsages, content, 'ui.buttons', globals);

		assert.equal(usages.length, 2);
		assert.equal(usages[0].type, 'js-namespace');
		assert.equal(usages[0].details?.namespace, 'BX.UI.Button');
		assert.equal(usages[1].type, 'js-namespace');
		assert.equal(usages[1].details?.namespace, 'BX.UI.Button');
	});

	it('should report longest matching global prefix on long member chains', () => {
		const content = `BX.UI.Notification.Center.notify({ content: 'x' });`;
		const globals = new Set(['BX.UI.Notification', 'BX.UI.Notification.Center']);
		const usages = collect(findJsUsages, content, 'ui.notification', globals);

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-namespace');
		assert.equal(usages[0].details?.namespace, 'BX.UI.Notification.Center');
	});

	it('should attach import names to ESM import', () => {
		const content = [
			`import Default, { Foo, Bar as Baz } from 'ui.buttons';`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.buttons');
		assert.equal(usages.length, 1);
		assert.deepEqual(usages[0].details?.imports, ['default', 'Foo', 'Bar']);
	});

	it('should report empty imports array for side-effect import', () => {
		const content = `import 'ui.buttons';`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.deepEqual(usages[0].details?.imports, []);
	});

	it('should report namespace import as *', () => {
		const content = `import * as B from 'ui.buttons';`;
		const usages = collect(findJsUsages, content, 'ui.buttons');

		assert.equal(usages.length, 1);
		assert.deepEqual(usages[0].details?.imports, ['*']);
	});

	it('should detect class inheritance from imported binding', () => {
		const content = [
			`import { Balloon } from 'ui.notification';`,
			`class MyBalloon extends Balloon {}`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.notification');
		const inheritance = usages.filter((u) => u.type === 'js-inheritance');

		assert.equal(inheritance.length, 1);
		assert.equal(inheritance[0].details?.inheritedFrom, 'Balloon');
	});

	it('should detect class inheritance from namespace chain', () => {
		const content = `class MyBalloon extends BX.UI.Notification.Balloon {}`;
		const globals = new Set(['BX.UI.Notification']);
		const usages = collect(findJsUsages, content, 'ui.notification', globals);

		const inheritance = usages.filter((u) => u.type === 'js-inheritance');
		assert.equal(inheritance.length, 1);
		assert.equal(inheritance[0].details?.inheritedFrom, 'BX.UI.Notification.Balloon');
	});

	it('should NOT report inheritance for unrelated extends', () => {
		const content = [
			`import { Foo } from 'somewhere.else';`,
			`class X extends Foo {}`,
		].join('\n');

		const usages = collect(findJsUsages, content, 'ui.notification');
		assert.equal(usages.length, 0);
	});

	it('matches parent.BX.UI.NS as the namespace', () => {
		const content = `parent.BX.UI.Notification.Center.notify({});`;
		const usages = collect(findJsUsages, content, 'ui.notification', new Set(['BX.UI.Notification.Center']));

		assert.equal(usages.length, 1);
		assert.equal(usages[0].details?.namespace, 'BX.UI.Notification.Center');
	});

	it('detects Reflection.getClass with literal chain (matches a child global)', () => {
		const content = `const N = Reflection.getClass('BX.UI.Notification.Center');`;
		const usages = collect(findJsUsages, content, 'ui.notification', new Set(['BX.UI.Notification.Center']));

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-namespace');
		assert.equal(usages[0].details?.namespace, 'BX.UI.Notification.Center');
	});

	it('detects Reflection.namespace with literal chain', () => {
		const content = `const N = Reflection.namespace('BX.UI.Notification.Center');`;
		const usages = collect(findJsUsages, content, 'ui.notification', new Set(['BX.UI.Notification.Center']));

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-namespace');
	});

	it('matches Reflection.getClass with the extension\'s own namespace via selfNamespace', () => {
		const usages: UsageLocation[] = [];
		findJsUsages(
			`const N = Reflection.getClass('BX.UI.Notification');`,
			'test.js',
			'ui.notification',
			new Set(['BX.UI.Notification.Center']), // child global, NOT the namespace itself
			usages,
			{ selfNamespace: 'BX.UI.Notification' },
		);

		assert.equal(usages.length, 1);
		assert.equal(usages[0].details?.namespace, 'BX.UI.Notification');
	});

	it('strips cross-frame prefix from Reflection.getClass argument (via selfNamespace)', () => {
		const usages: UsageLocation[] = [];
		findJsUsages(
			`const N = Reflection.getClass('top.BX.UI.Notification');`,
			'test.js',
			'ui.notification',
			new Set(),
			usages,
			{ selfNamespace: 'BX.UI.Notification' },
		);

		assert.equal(usages.length, 1);
		assert.equal(usages[0].details?.namespace, 'BX.UI.Notification');
	});

	it('does NOT match Reflection.getClass(\'BX.UI\') against shared-root extension', () => {
		// ui.buttons' namespace is `BX.UI`, which is shared with dozens of other
		// extensions (ui.notification, ui.progressbar, …). Code that does
		// `Reflection.namespace('BX.UI')` is hanging its own class off the
		// shared root, not using ui.buttons.
		const usages: UsageLocation[] = [];
		findJsUsages(
			`Reflection.namespace('BX.UI').MyClass = class {};`,
			'test.js',
			'ui.buttons',
			new Set(['BX.UI.Button']),
			usages,
			{ selfNamespace: 'BX.UI' },
		);

		assert.equal(usages.length, 0);
	});

	it('does match Reflection.getClass for a 3+ segment own namespace', () => {
		const usages: UsageLocation[] = [];
		findJsUsages(
			`const N = Reflection.getClass('BX.UI.Notification');`,
			'test.js',
			'ui.notification',
			new Set(['BX.UI.Notification.Center']),
			usages,
			{ selfNamespace: 'BX.UI.Notification' },
		);

		assert.equal(usages.length, 1);
		assert.equal(usages[0].details?.namespace, 'BX.UI.Notification');
	});

	it('does NOT match BX.UI.SomethingElse against shared-root extension (BX.UI)', () => {
		// `ui.buttons` lives at `BX.UI`. Other extensions (`ui.entity-editor`,
		// `ui.notification`, ...) also live under `BX.UI`. A usage of
		// `BX.UI.EntityEditorField` from `ui.entity-editor` must NOT be counted
		// as a usage of `ui.buttons`.
		const usages: UsageLocation[] = [];
		findJsUsages(
			`class X extends BX.UI.EntityEditorField {}`,
			'test.js',
			'ui.buttons',
			new Set(['BX.UI.Button']), // only ui.buttons' own children
			usages,
			{ selfNamespace: 'BX.UI' },
		);

		assert.equal(usages.length, 0);
	});

	it('matches top.BX.UI.NS as the namespace (cross-frame access)', () => {
		const content = `top.BX.UI.Notification.Center.notify({ content: 'x' });`;
		const usages = collect(findJsUsages, content, 'ui.notification', new Set(['BX.UI.Notification.Center']));

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-namespace');
		assert.equal(usages[0].details?.namespace, 'BX.UI.Notification.Center');
	});

	it('matches window.top.BX.UI.NS as the namespace', () => {
		const content = `window.top.BX.UI.Notification.Center.notify({});`;
		const usages = collect(findJsUsages, content, 'ui.notification', new Set(['BX.UI.Notification.Center']));

		assert.equal(usages.length, 1);
		assert.equal(usages[0].details?.namespace, 'BX.UI.Notification.Center');
	});

	it('does not double-report a superclass as both namespace and inheritance', () => {
		const content = `class X extends BX.UI.Notification.Balloon {}`;
		const usages = collect(findJsUsages, content, 'ui.notification', new Set(['BX.UI.Notification']));

		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-inheritance');
	});

	it('normalizes prefix on inheritance details', () => {
		const content = `class X extends top.BX.UI.Notification.Balloon {}`;
		const usages = collect(findJsUsages, content, 'ui.notification', new Set(['BX.UI.Notification']));

		const inh = usages.filter((u) => u.type === 'js-inheritance');
		assert.equal(inh.length, 1);
		assert.equal(inh[0].details?.inheritedFrom, 'BX.UI.Notification.Balloon');
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

describe('findPhpLoaders', () => {
	function collectLoaders(content: string, extensionName: string, file = 'test.php'): UsageLocation[]
	{
		const usages: UsageLocation[] = [];
		findPhpLoaders(content, file, extensionName, usages);
		return usages;
	}

	it('finds Extension::load', () => {
		const usages = collectLoaders(`Extension::load('ui.buttons');`, 'ui.buttons');
		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'php-extension-load');
	});

	it('finds CJSCore::Init', () => {
		const usages = collectLoaders(`CJSCore::Init(['ui.buttons']);`, 'ui.buttons');
		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'php-cjscore');
	});

	it('finds config.php rel', () => {
		const usages = collectLoaders(`'rel' => ['ui.buttons'],`, 'ui.buttons', '/path/config.php');
		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'config-rel');
	});

	it('does NOT find inline namespace access (that belongs to findJsUsagesInPhp)', () => {
		const content = `<script>new BX.UI.Button();</script>`;
		const usages = collectLoaders(content, 'ui.buttons');
		assert.equal(usages.length, 0);
	});
});

describe('findJsUsagesInPhp', () => {
	function collectInline(
		content: string,
		extensionName: string,
		globals: Set<string> = new Set(),
		file = 'test.php',
	): UsageLocation[]
	{
		const usages: UsageLocation[] = [];
		findJsUsagesInPhp(content, file, extensionName, globals, usages);
		return usages;
	}

	it('finds ESM import inside <script>', () => {
		const content = [
			`<div>hello</div>`,
			`<script>`,
			`import { Button } from 'ui.buttons';`,
			`</script>`,
		].join('\n');

		const usages = collectInline(content, 'ui.buttons');
		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-import');
		assert.equal(usages[0].line, 3);
		assert.deepEqual(usages[0].details?.imports, ['Button']);
	});

	it('finds namespace access inside <script>', () => {
		const content = [
			`<?php echo 1; ?>`,
			`<script>`,
			`new BX.UI.Button();`,
			`</script>`,
		].join('\n');

		const usages = collectInline(content, 'ui.buttons', new Set(['BX.UI.Button']));
		assert.equal(usages.length, 1);
		assert.equal(usages[0].type, 'js-namespace');
		assert.equal(usages[0].line, 3);
		assert.equal(usages[0].details?.namespace, 'BX.UI.Button');
	});

	it('finds inheritance inside <script>', () => {
		const content = [
			`<script>`,
			`class X extends BX.UI.Button {}`,
			`</script>`,
		].join('\n');

		const usages = collectInline(content, 'ui.buttons', new Set(['BX.UI.Button']));
		const inheritance = usages.filter((u) => u.type === 'js-inheritance');
		assert.equal(inheritance.length, 1);
		assert.equal(inheritance[0].line, 2);
	});

	it('ignores extension name outside <script> tags', () => {
		const content = `<?php $x = 'ui.buttons'; ?> <span>ui.buttons</span>`;
		const usages = collectInline(content, 'ui.buttons');
		assert.equal(usages.length, 0);
	});

	it('keeps correct line numbers when <script> appears at line N', () => {
		const content = [
			`line1`,
			`line2`,
			`line3 <script>`,
			`new BX.UI.Button();`,
			`</script>`,
		].join('\n');

		const usages = collectInline(content, 'ui.buttons', new Set(['BX.UI.Button']));
		assert.equal(usages.length, 1);
		assert.equal(usages[0].line, 4);
	});

	it('falls back to regex when <script> has interpolated PHP that breaks the AST', () => {
		// PHP echo splits an identifier — JS AST cannot recover. Sanitization
		// turns <?= ?> into whitespace, which leaves `BX.UI.<spaces>.Button`
		// that still parses, so this is an aspirational test for robustness.
		const content = [
			`<script>`,
			`new BX.UI.Button({ color: <?= $color ?> });`,
			`</script>`,
		].join('\n');

		const usages = collectInline(content, 'ui.buttons', new Set(['BX.UI.Button']));
		// Either AST or regex should find at least the namespace usage.
		const namespaces = usages.filter((u) => u.type === 'js-namespace');
		assert.isAtLeast(namespaces.length, 1);
	});
});
