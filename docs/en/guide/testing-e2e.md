# E2E Tests

E2E tests use the [Playwright Test API](https://playwright.dev/docs/api/class-test) and run in a real browser. There are two approaches:

| Approach | When to use | Import |
|----------|-------------|--------|
| **[Component Sandbox](/en/guide/testing-sandbox)** | Testing a component in isolation | `ui.test.e2e.sandbox` |
| **Real interface** | Testing on product pages | `@playwright/test` or `ui.test.e2e.auth` |

## Structure

```
local/js/vendor/my-extension/
└── tests/
    └── e2e/
        ├── my-extension.spec.ts
        └── navigation.spec.ts
```

## Component Sandbox

For testing components in isolation — without tying tests to a specific product page. See [Component Sandbox](/en/guide/testing-sandbox) for details.

```ts
import { test, expect } from 'ui.test.e2e.sandbox';

test('button renders correctly', async ({ sandbox }) => {
  await sandbox.loadExtension('ui.buttons');

  await sandbox.mount((selector) => {
    const btn = new BX.UI.Button({ text: 'Click me', color: 'success' });
    document.querySelector(selector).appendChild(btn.render());
  });

  await expect(sandbox.page.locator('.ui-btn-success')).toBeVisible();
  await expect(sandbox.page.locator('.ui-btn-success')).toHaveText('Click me');
});
```

For Vue components see [E2E Tests Vue 3](/en/guide/testing-e2e-vue).

## Real Interface

For testing on product pages — navigation, forms, interaction with the actual UI.

### Public Pages

Pages accessible without authentication:

```ts
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

### Authenticated Pages

For pages that require authentication, import `test` from `ui.test.e2e.auth`. Before each test, automatic login will be performed using credentials from `.env.test`:

```ts
import { test, expect } from 'ui.test.e2e.auth';

test('admin panel is accessible', async ({ page }) => {
  // page is already authenticated
  await page.goto('/bitrix/admin/');

  await expect(page.locator('.adm-header')).toBeVisible();
});
```

### Testing as Different Users

Sometimes the same behavior needs to be checked under different accounts — for example, that an element is visible to an administrator but not available to a regular employee. To do this, add extra users to `.env.test`: a `LOGIN_<ID>` / `PASSWORD_<ID>` pair per user. The `<ID>` is the suffix in the variable name (its case doesn't matter; you select the user by that same identifier in the test).

```
BASE_URL=http://your-local-bitrix.test

# default (for example, an administrator)
LOGIN=admin
PASSWORD=admin-password

# additional user
LOGIN_MANAGER=manager
PASSWORD_MANAGER=manager-password
```

**A whole block of tests as a given user** — via `test.use({ user })`:

```ts
import { test, expect } from 'ui.test.e2e.auth';

test.describe('The section as a regular employee', () => {
  test.use({ user: 'manager' });

  test('the settings button is unavailable to a non-admin', async ({ page }) => {
    await page.goto('/settings/');

    await expect(page.locator('.settings-button')).toHaveCount(0);
  });
});
```

Blocks without `test.use` keep running as the default user (`LOGIN` / `PASSWORD`) — existing tests need no changes.

**Two users in a single test** — via `loginAs`, which opens a page as another user in a separate browser context. This is useful for "one user did something, another sees it" scenarios:

```ts
import { test, expect } from 'ui.test.e2e.auth';

test('an admin change is visible to an employee', async ({ page, loginAs }) => {
  // page is the default user (the administrator)
  await page.goto('/settings/');
  await page.click('.publish-button');

  // the employee opens the same page in their own context
  const managerPage = await loginAs('manager');
  await managerPage.goto('/settings/');

  await expect(managerPage.locator('.published-banner')).toBeVisible();
});
```

The context opened via `loginAs` is closed automatically when the test finishes.

### Working with Forms

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

### Waiting for AJAX Requests

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

## Useful Links

- [Writing Tests](https://playwright.dev/docs/writing-tests) — test writing basics
- [Locators](https://playwright.dev/docs/locators) — finding elements on the page
- [Assertions](https://playwright.dev/docs/test-assertions) — checks (`expect`)
- [Actions](https://playwright.dev/docs/input) — clicks, text input, file uploads
- [Auto-waiting](https://playwright.dev/docs/actionability) — how Playwright waits for element readiness
