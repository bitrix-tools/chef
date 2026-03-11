# Component Sandbox

Для e2e-тестирования визуальных компонентов без привязки к конкретной странице используйте `component-wrapper.php`. Эта страница загружает расширение со всеми зависимостями и предоставляет пустой `<div id="sandbox">` для монтирования компонентов. Авторизация не требуется — страница доступна без неё.

## Принцип работы

1. Открываете `component-wrapper.php?extension=<name>` — загружаются все JS/CSS расширения
2. Монтируете компоненты через `page.evaluate()`
3. Проверяете визуальное поведение через Playwright

## Обычные компоненты

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

## Vue-компоненты

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

## Несколько расширений

Можно загрузить несколько расширений через запятую:

```ts
await page.goto('/dev/ui/cli/component-wrapper.php?extension=ui.buttons,ui.icons');
```

## Когда использовать

| Подход | Когда |
|--------|-------|
| **Конкретная страница** (`page.goto('/my-page/')`) | Тестируете поведение на реальной странице продукта |
| **Component Sandbox** | Тестируете визуальный компонент в изоляции, без привязки к роуту |
