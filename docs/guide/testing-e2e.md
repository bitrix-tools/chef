# E2E-тесты

E2E-тесты используют [Playwright Test API](https://playwright.dev/docs/api/class-test) и запускаются в реальном браузере. Есть два подхода:

| Подход | Когда использовать | Импорт |
|--------|--------------------|--------|
| **[Component Sandbox](/guide/testing-sandbox)** | Тестирование компонента в изоляции | `ui.test.e2e.sandbox` |
| **Реальный интерфейс** | Тестирование на страницах продукта | `@playwright/test` или `ui.test.e2e.auth` |

## Структура

```
local/js/vendor/my-extension/
└── tests/
    └── e2e/
        ├── my-extension.spec.ts
        └── navigation.spec.ts
```

## Component Sandbox

Для тестирования компонентов в изоляции — без привязки к конкретной странице продукта. Подробнее в разделе [Component Sandbox](/guide/testing-sandbox).

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

Для Vue-компонентов смотрите [E2E-тесты Vue 3](/guide/testing-e2e-vue).

## Реальный интерфейс

Для тестирования на страницах продукта — навигация, формы, взаимодействие с реальным UI.

### Публичные страницы

Страницы, доступные без авторизации:

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
  await expect(popup).toContainText('Настройки');
});
```

### Страницы с авторизацией

Для страниц, требующих авторизации, импортируйте `test` из `ui.test.e2e.auth`. Перед каждым тестом будет выполнен автоматический вход с учётными данными из `.env.test`:

```ts
import { test, expect } from 'ui.test.e2e.auth';

test('admin panel is accessible', async ({ page }) => {
  // page уже авторизован
  await page.goto('/bitrix/admin/');

  await expect(page.locator('.adm-header')).toBeVisible();
});
```

### Работа с формами

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

### Ожидание AJAX-запросов

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

## Полезные ссылки

- [Writing Tests](https://playwright.dev/docs/writing-tests) — основы написания тестов
- [Locators](https://playwright.dev/docs/locators) — поиск элементов на странице
- [Assertions](https://playwright.dev/docs/test-assertions) — проверки (`expect`)
- [Actions](https://playwright.dev/docs/input) — клики, ввод текста, загрузка файлов
- [Auto-waiting](https://playwright.dev/docs/actionability) — как Playwright ждёт готовности элементов
