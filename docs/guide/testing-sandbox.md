# Component Sandbox

Фикстура `ui.test.e2e.sandbox` упрощает e2e-тестирование визуальных компонентов. Она загружает расширение со всеми зависимостями и предоставляет контейнер для монтирования компонентов. Авторизация не требуется.

## API

Фикстура предоставляет объект `sandbox`:

- `sandbox.setLang(lang)` — устанавливает язык для загрузки расширения
- `sandbox.loadExtension(extension)` — загружает расширение (строка или массив строк)
- `sandbox.mount(callback)` — монтирует компонент, передаёт CSS-селектор контейнера в колбэк
- `sandbox.page` — доступ к Playwright `page`

## Обычные компоненты

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

## Vue-компоненты

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

## Несколько расширений

```ts
await sandbox.loadExtension(['ui.buttons', 'ui.icons']);
```

## Язык

При необходимости можно указать язык — он будет использован при загрузке расширения:

```ts
sandbox.setLang('en');
await sandbox.loadExtension('vendor.my-app');
```

## Совмещение с `page`

`sandbox.page` — это тот же Playwright `page`. Можно деструктурировать оба:

```ts
test('combined example', async ({ page, sandbox }) => {
  await sandbox.loadExtension('ui.buttons');
  await sandbox.mount((selector) => { /* ... */ });

  // page и sandbox.page — один и тот же объект
  await expect(page.locator('.ui-btn')).toBeVisible();
});
```
