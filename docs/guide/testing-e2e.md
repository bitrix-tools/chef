# E2E-тесты

E2E-тесты используют [Playwright Test API](https://playwright.dev/docs/api/class-test) и запускаются в реальном браузере на реальной странице Bitrix.

## Структура

```
local/js/vendor/my-extension/
└── test/
    └── e2e/
        ├── my-extension.spec.ts
        └── navigation.spec.ts
```

## Базовый тест

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
  await expect(popup).toContainText('Настройки');
});
```

## Тесты с авторизацией

Для страниц, требующих авторизации, импортируйте `test` из `ui.test.e2e.auth`. Перед каждым тестом будет выполнен автоматический вход с учётными данными из `.env.test`:

```ts
import { test, expect } from 'ui.test.e2e.auth';

test('admin panel is accessible', async ({ page }) => {
  // page уже авторизован
  await page.goto('/bitrix/admin/');

  await expect(page.locator('.adm-header')).toBeVisible();
});
```

## Работа с формами

```ts
import { test, expect } from 'ui.test.e2e.auth';

test('should save form data', async ({ page }) => {
  await page.goto('/settings/');

  await page.fill('input[name="title"]', 'Новый заголовок');
  await page.selectOption('select[name="category"]', 'news');
  await page.click('button[type="submit"]');

  await expect(page.locator('.success-message')).toBeVisible();
});
```

## Ожидание AJAX-запросов

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
