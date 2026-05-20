import { assert } from 'chai';

import { collectExportsFromAst } from '../../../src/commands/diag/package-snapshot';

function collect(content: string, namespace = 'BX.UI.Notification', file = 'index.ts'): Set<string>
{
	const out = new Set<string>();
	collectExportsFromAst(content, file, namespace, out);
	return out;
}

describe('collectExportsFromAst', () => {
	it('picks up export class/function/const (PascalCase only)', () => {
		const out = collect([
			`export class Manager {}`,
			`export function Helper() {}`,
			`export const Stack = 1;`,
			`export const lowercase = 2;`, // ignored — Bitrix convention
		].join('\n'));

		assert.deepEqual([...out].sort(), ['Helper', 'Manager', 'Stack']);
	});

	it('picks up named export bindings', () => {
		const out = collect([
			`class Foo {}`,
			`class Bar {}`,
			`export { Foo, Bar as Baz };`,
		].join('\n'));

		assert.deepEqual([...out].sort(), ['Baz', 'Foo']);
	});

	it('detects Object.defineProperty on the literal namespace', () => {
		const out = collect(`Object.defineProperty(BX.UI.Notification, 'Center', { get() { return null; } });`);

		assert.deepEqual([...out], ['Center']);
	});

	it('detects Object.defineProperty on window.<namespace>', () => {
		const out = collect(`Object.defineProperty(window.BX.UI.Notification, 'Center', { get() { return null; } });`);

		assert.deepEqual([...out], ['Center']);
	});

	it('detects Object.defineProperty on a local alias of the namespace', () => {
		const out = collect([
			`const ns = window.BX.UI.Notification;`,
			`Object.defineProperty(ns, 'Center', { get() { return null; } });`,
		].join('\n'));

		assert.deepEqual([...out], ['Center']);
	});

	it('detects direct property assignment on the namespace', () => {
		const out = collect(`BX.UI.Notification.Stack = class {};`);

		assert.deepEqual([...out], ['Stack']);
	});

	it('detects direct property assignment via local alias', () => {
		const out = collect([
			`const ns = BX.UI.Notification;`,
			`ns.Stack = class {};`,
		].join('\n'));

		assert.deepEqual([...out], ['Stack']);
	});

	it('ignores non-namespace defineProperty targets', () => {
		const out = collect([
			`const someOther = window.BX.SomethingElse;`,
			`Object.defineProperty(someOther, 'X', { get() { return null; } });`,
		].join('\n'));

		assert.deepEqual([...out], []);
	});

	it('ignores property assignment on unrelated objects', () => {
		const out = collect(`Foo.Bar.Baz = 1;`);
		assert.deepEqual([...out], []);
	});

	it('ignores lowercase property names (Bitrix convention: exports are PascalCase)', () => {
		const out = collect([
			`BX.UI.Notification.helper = function() {};`,
			`Object.defineProperty(BX.UI.Notification, 'config', { value: {} });`,
		].join('\n'));

		assert.deepEqual([...out], []);
	});

	it('does not match a different namespace', () => {
		const out = collect(
			`Object.defineProperty(BX.UI.Buttons, 'X', { value: 1 });`,
			'BX.UI.Notification',
		);

		assert.deepEqual([...out], []);
	});

	it('handles all four root prefixes (window/globalThis/self/this)', () => {
		const out = collect([
			`Object.defineProperty(window.BX.UI.Notification, 'A', {});`,
			`Object.defineProperty(globalThis.BX.UI.Notification, 'B', {});`,
			`Object.defineProperty(self.BX.UI.Notification, 'C', {});`,
			`Object.defineProperty(this.BX.UI.Notification, 'D', {});`,
		].join('\n'));

		assert.deepEqual([...out].sort(), ['A', 'B', 'C', 'D']);
	});

	it('peels TypeScript `as` cast when resolving namespace alias', () => {
		const out = collect([
			`const ns = (window as unknown as { BX: { UI: { Notification: Record<string, unknown> } } }).BX.UI.Notification;`,
			`Object.defineProperty(ns, 'Center', { get() { return null; } });`,
		].join('\n'));

		assert.deepEqual([...out], ['Center']);
	});

	it('matches the real ui.notification entry pattern', () => {
		// Verbatim shape of ui/install/js/ui/notification/src/index.ts
		const out = collect([
			`import { Action } from './action';`,
			`import { Balloon } from './balloon';`,
			`import { Manager } from './manager';`,
			``,
			`export { Manager, Balloon, Action };`,
			``,
			`const namespace = (window as unknown as { BX: { UI: { Notification: Record<string, unknown> } } })`,
			`	.BX.UI.Notification;`,
			``,
			`let centerInstance: Manager | null = null;`,
			`Object.defineProperty(namespace, 'Center', {`,
			`	enumerable: false,`,
			`	configurable: true,`,
			`	get(): Manager {`,
			`		if (centerInstance === null) centerInstance = new Manager();`,
			`		return centerInstance;`,
			`	},`,
			`});`,
		].join('\n'));

		assert.includeMembers([...out], ['Manager', 'Balloon', 'Action', 'Center']);
	});
});
