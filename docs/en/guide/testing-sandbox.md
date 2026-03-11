# Component Sandbox

To e2e-test visual components without tying tests to a specific page, use `component-wrapper.php`. This page loads the extension with all its dependencies and provides an empty `<div id="sandbox">` for mounting components. No authentication required — the page is accessible without it.

## How it works

1. Open `component-wrapper.php?extension=<name>` — all JS/CSS for the extension are loaded
2. Mount components via `page.evaluate()`
3. Verify visual behavior with Playwright

## Regular Components

```ts
import { test, expect } from '@playwright/test';

test('button renders correctly', async ({ page }) => {
  await page.goto('/dev/ui/cli/component-wrapper.php?extension=ui.buttons');

  await page.evaluate(() => {
    const btn = new BX.UI.Button({ text: 'Click me', color: 'success' });
    document.getElementById('sandbox').appendChild(btn.render());
  });

  await expect(page.locator('.ui-btn-success')).toBeVisible();
  await expect(page.locator('.ui-btn-success')).toHaveText('Click me');
});
```

## Vue Components

```ts
import { test, expect } from '@playwright/test';

test('counter component', async ({ page }) => {
  await page.goto('/dev/ui/cli/component-wrapper.php?extension=vendor.my-app');

  await page.evaluate(() => {
    const { BitrixVue } = BX.Vue3;
    const { Counter } = BX.Vendor.MyApp;
    BitrixVue.createApp(Counter, { initial: 5 }).mount('#sandbox');
  });

  await expect(page.locator('[data-testid="count"]')).toHaveText('5');
  await page.click('[data-testid="increment"]');
  await expect(page.locator('[data-testid="count"]')).toHaveText('6');
});
```

## Multiple Extensions

You can load multiple extensions separated by commas:

```ts
await page.goto('/dev/ui/cli/component-wrapper.php?extension=ui.buttons,ui.icons');
```

## When to Use

| Approach | When |
|----------|------|
| **Specific page** (`page.goto('/my-page/')`) | Testing behavior on an actual product page |
| **Component Sandbox** | Testing a visual component in isolation, without depending on a route |
