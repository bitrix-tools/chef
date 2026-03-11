# Component Sandbox

The `ui.test.e2e.sandbox` fixture simplifies e2e testing of visual components. It loads the extension with all its dependencies and provides a container for mounting components. No authentication required.

## API

The fixture provides a `sandbox` object:

- `sandbox.setLang(lang)` — sets the language for loading the extension
- `sandbox.loadExtension(extension)` — loads the extension (string or array of strings)
- `sandbox.mount(callback)` — mounts a component, passes the container CSS selector to the callback
- `sandbox.page` — access to Playwright `page`

## Regular Components

```ts
import { test, expect } from 'ui.test.e2e.sandbox';

test('button renders correctly', async ({ sandbox }) => {
  await sandbox.loadExtension('ui.buttons');

  await sandbox.mount((selector) => {
    const btn = new BX.UI.Button({ text: 'Click me', color: 'success' });
    document.querySelector(selector).appendChild(btn.render());
  });

  await expect(sandbox.page.locator('.ui-btn-success')).toBeVisible();
});
```

## Vue Components

```ts
import { test, expect } from 'ui.test.e2e.sandbox';

test('counter component', async ({ sandbox }) => {
  await sandbox.loadExtension('vendor.my-app');

  await sandbox.mount((selector) => {
    const { BitrixVue } = BX.Vue3;
    const { Counter } = BX.Vendor.MyApp;
    BitrixVue.createApp(Counter, { initial: 0 }).mount(selector);
  });

  await sandbox.page.click('[data-testid="increment"]');
  await expect(sandbox.page.locator('[data-testid="count"]')).toHaveText('1');
});
```

## Multiple Extensions

```ts
await sandbox.loadExtension(['ui.buttons', 'ui.icons']);
```

## Language

If needed, you can specify the language — it will be used when loading the extension:

```ts
sandbox.setLang('en');
await sandbox.loadExtension('vendor.my-app');
```

## Combining with `page`

`sandbox.page` is the same Playwright `page`. You can destructure both:

```ts
test('combined example', async ({ page, sandbox }) => {
  await sandbox.loadExtension('ui.buttons');
  await sandbox.mount((selector) => { /* ... */ });

  // page and sandbox.page are the same object
  await expect(page.locator('.ui-btn')).toBeVisible();
});
```
