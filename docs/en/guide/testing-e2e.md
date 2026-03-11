# E2E Tests

E2E tests use the [Playwright Test API](https://playwright.dev/docs/api/class-test) and run in a real browser on an actual Bitrix page.

## Structure

```
local/js/vendor/my-extension/
└── test/
    └── e2e/
        ├── my-extension.spec.ts
        └── navigation.spec.ts
```

## Basic Test

```ts
// test/e2e/my-extension.spec.ts
import { test, expect } from '@playwright/test';

test('widget renders on page', async ({ page }) => {
  await page.goto('/my-page/');

  const widget = page.locator('.my-widget');
  await expect(widget).toBeVisible();
});

test('button click shows popup', async ({ page }) => {
  await page.goto('/my-page/');

  await page.click('.my-widget__button');

  const popup = page.locator('.popup-window');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('Settings');
});
```

## Authenticated Tests

For pages that require authentication, import `test` from `ui.test.e2e.auth`. Before each test, automatic login will be performed using credentials from `.env.test`:

```ts
import { test, expect } from 'ui.test.e2e.auth';

test('admin panel is accessible', async ({ page }) => {
  // page is already authenticated
  await page.goto('/bitrix/admin/');

  await expect(page.locator('.adm-header')).toBeVisible();
});
```

## Working with Forms

```ts
import { test, expect } from 'ui.test.e2e.auth';

test('should save form data', async ({ page }) => {
  await page.goto('/settings/');

  await page.fill('input[name="title"]', 'New Title');
  await page.selectOption('select[name="category"]', 'news');
  await page.click('button[type="submit"]');

  await expect(page.locator('.success-message')).toBeVisible();
});
```

## Waiting for AJAX Requests

```ts
import { test, expect } from 'ui.test.e2e.auth';

test('should load items via ajax', async ({ page }) => {
  await page.goto('/items/');

  const response = page.waitForResponse('**/ajax/**');
  await page.click('.load-more');
  await response;

  const items = page.locator('.item-card');
  await expect(items).toHaveCount(20);
});
```
