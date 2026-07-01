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

### Тесты под разными пользователями

Иногда одно и то же поведение нужно проверить под разными учётными записями — например, что элемент виден администратору, но недоступен обычному сотруднику. Для этого в `.env.test` добавляются дополнительные пользователи: пара `LOGIN_<ID>` / `PASSWORD_<ID>` на каждого. Идентификатор `<ID>` — суффикс в имени переменной (регистр в имени переменной не важен, в тесте пользователь указывается по этому же идентификатору).

```
BASE_URL=http://your-local-bitrix.test

# по умолчанию (например, администратор)
LOGIN=admin
PASSWORD=admin-password

# дополнительный пользователь
LOGIN_MANAGER=manager
PASSWORD_MANAGER=manager-password
```

**Весь блок тестов под выбранным пользователем** — через `test.use({ user })`:

```ts
import { test, expect } from 'ui.test.e2e.auth';

test.describe('Раздел глазами обычного сотрудника', () => {
  test.use({ user: 'manager' });

  test('кнопка настроек недоступна не-администратору', async ({ page }) => {
    await page.goto('/settings/');

    await expect(page.locator('.settings-button')).toHaveCount(0);
  });
});
```

Блоки без `test.use` продолжают работать под пользователем по умолчанию (`LOGIN` / `PASSWORD`) — существующие тесты менять не нужно.

**Двух пользователей в одном тесте** — через `loginAs`, который открывает страницу под другим пользователем в отдельном контексте браузера. Это нужно для сценариев «один пользователь что-то сделал — другой это увидел»:

```ts
import { test, expect } from 'ui.test.e2e.auth';

test('изменение администратора видно сотруднику', async ({ page, loginAs }) => {
  // page — пользователь по умолчанию (администратор)
  await page.goto('/settings/');
  await page.click('.publish-button');

  // сотрудник открывает ту же страницу в своём контексте
  const managerPage = await loginAs('manager');
  await managerPage.goto('/settings/');

  await expect(managerPage.locator('.published-banner')).toBeVisible();
});
```

Контекст, открытый через `loginAs`, автоматически закрывается по завершении теста.

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
