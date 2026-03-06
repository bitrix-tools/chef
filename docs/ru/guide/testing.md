# Тестирование

Chef запускает тесты в реальном браузере через [Playwright](https://playwright.dev/). Поддерживаются два вида тестов: unit-тесты ([Mocha](https://mochajs.org/) + [Chai](https://www.chaijs.com/)) и E2E-тесты (Playwright Test API).

## Подготовка

Инициализируйте тестовое окружение:

```bash
chef init tests
```

Команда создаёт `playwright.config.ts` и `.env.test` в корне проекта. Подробнее — в разделе [Настройка тестов](/ru/guide/test-setup).

Установите браузеры Playwright:

```bash
npx playwright install
```

## Unit-тесты

Unit-тесты пишутся на Mocha + Chai и запускаются в реальном браузере. Исходный код расширения компилируется и загружается на страницу вместе с тестами — тестируется настоящий бандл, как он будет работать в браузере.

### Структура

```
local/js/vendor/my-extension/
└── test/
    └── unit/
        ├── my-extension.test.ts
        └── utils.test.ts
```

### Базовый тест

```ts
// test/unit/my-extension.test.ts
import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { MyExtension } from '../../src/my-extension';

describe('MyExtension', () => {
  let instance: MyExtension;

  beforeEach(() => {
    instance = new MyExtension({ name: 'test' });
  });

  it('should create instance with name', () => {
    assert.equal(instance.getName(), 'test');
  });

  it('should throw on invalid name', () => {
    assert.throws(() => {
      new MyExtension({ name: '' });
    }, TypeError);
  });
});
```

### Тестирование DOM

Тесты запускаются в браузере, поэтому доступен полноценный DOM:

```ts
import { describe, it, afterEach } from 'mocha';
import { assert } from 'chai';

import { Button } from '../../src/button';

describe('Button', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should render button element', () => {
    const button = new Button({ text: 'OK' });
    container.appendChild(button.render());

    const node = container.querySelector('.ui-btn');
    assert.isNotNull(node);
    assert.equal(node?.textContent, 'OK');
  });

  it('should handle click', () => {
    let clicked = false;
    const button = new Button({
      text: 'OK',
      onClick: () => { clicked = true; },
    });

    container.appendChild(button.render());
    container.querySelector('.ui-btn')?.click();

    assert.isTrue(clicked);
  });
});
```

### Тестирование асинхронного кода

```ts
import { describe, it } from 'mocha';
import { assert } from 'chai';

import { DataLoader } from '../../src/data-loader';

describe('DataLoader', () => {
  it('should load data', async () => {
    const loader = new DataLoader('/api/items');
    const result = await loader.fetch();

    assert.isArray(result.items);
    assert.isAbove(result.items.length, 0);
  });

  it('should handle errors', async () => {
    const loader = new DataLoader('/api/not-found');

    try
    {
      await loader.fetch();
      assert.fail('Expected error');
    }
    catch (error)
    {
      assert.instanceOf(error, Error);
    }
  });
});
```

### Тестирование EventEmitter

```ts
import { describe, it } from 'mocha';
import { assert } from 'chai';

import { Chat } from '../../src/chat';

describe('Chat', () => {
  it('should emit message event', () => {
    const chat = new Chat();
    const messages: string[] = [];

    chat.subscribe('message', (event) => {
      messages.push(event.getData().text);
    });

    chat.sendMessage('hello');
    chat.sendMessage('world');

    assert.deepEqual(messages, ['hello', 'world']);
  });
});
```

### Типы для тестов

`mocha`, `chai` и их типы включены в Chef и используются при запуске `chef test`. Для работы автодополнения в IDE установите типы локально:

```bash
npm install --save-dev @types/mocha @types/chai
```

## E2E-тесты

E2E-тесты используют [Playwright Test API](https://playwright.dev/docs/api/class-test) и запускаются в реальном браузере на реальной странице Bitrix.

### Структура

```
local/js/vendor/my-extension/
└── test/
    └── e2e/
        ├── my-extension.spec.ts
        └── navigation.spec.ts
```

### Базовый тест

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

### Тесты с авторизацией

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

  // Ждём завершения AJAX-запроса
  const response = page.waitForResponse('**/ajax/**');
  await page.click('.load-more');
  await response;

  const items = page.locator('.item-card');
  await expect(items).toHaveCount(20);
});
```

## Запуск тестов

```bash
# Все тесты расширения
chef test vendor.my-extension

# Только unit-тесты
chef test unit vendor.my-extension

# Только e2e-тесты
chef test e2e vendor.my-extension

# Конкретный файл
chef test unit vendor.my-extension ./utils.test.ts

# Тесты по паттерну
chef test vendor.* --grep "should render"

# Watch-режим — перезапуск при изменениях
chef test vendor.my-extension -w
```

### Отладка

```bash
# Открыть браузер с DevTools
chef test vendor.my-extension --debug

# С видимым окном браузера
chef test vendor.my-extension --headed

# В конкретном браузере
chef test vendor.my-extension --project chromium
```

В режиме `--debug` включаются source maps и открываются DevTools — можно ставить breakpoints прямо в исходном TypeScript-коде.

## Советы

### Изоляция тестов

Каждый тест должен быть независимым. Используйте `beforeEach`/`afterEach` для настройки и очистки:

```ts
describe('TodoList', () => {
  let list: TodoList;

  beforeEach(() => {
    list = new TodoList();
  });

  afterEach(() => {
    list.destroy();
  });

  it('should add item', () => {
    list.add('Buy milk');
    assert.equal(list.getCount(), 1);
  });

  it('should start empty', () => {
    // Не зависит от предыдущего теста
    assert.equal(list.getCount(), 0);
  });
});
```

### Организация тестов

Группируйте тесты по функциональности:

```ts
describe('UserService', () => {
  describe('create', () => {
    it('should create user with valid data', () => { /* ... */ });
    it('should throw on duplicate email', () => { /* ... */ });
  });

  describe('update', () => {
    it('should update user name', () => { /* ... */ });
    it('should not allow empty name', () => { /* ... */ });
  });

  describe('delete', () => {
    it('should soft delete user', () => { /* ... */ });
  });
});
```
