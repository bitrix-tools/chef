# E2E-тесты Vue 3

Руководство по e2e-тестированию расширений, использующих Vue 3 (`ui.vue3`). Тесты запускаются через Playwright в реальном браузере — компоненты монтируются в настоящий DOM и работают с реальным Vue из расширения `ui.vue3`.

## Принцип работы

1. Открываете [Component Sandbox](/guide/testing-sandbox) с нужным расширением
2. Монтируете Vue-компонент через `page.evaluate()` и `BitrixVue.createApp()`
3. Взаимодействуете с компонентом через Playwright (клики, ввод текста)
4. Проверяете результат через `expect`

## Структура

```
local/js/vendor/my-app/
└── test/
    └── e2e/
        ├── counter.spec.ts
        └── message-list.spec.ts
```

## Монтирование компонента

```ts
import { test, expect } from '@playwright/test';

test('should render counter', async ({ page }) => {
  await page.goto('/dev/ui/cli/component-wrapper.php?extension=vendor.my-app');

  await page.evaluate(() => {
    const { BitrixVue } = BX.Vue3;
    const { Counter } = BX.Vendor.MyApp;
    BitrixVue.createApp(Counter, { initial: 5 }).mount('#sandbox');
  });

  await expect(page.locator('[data-testid="count"]')).toHaveText('5');
});
```

## Взаимодействие с компонентом

### Клики

```ts
test('should increment on click', async ({ page }) => {
  await page.goto('/dev/ui/cli/component-wrapper.php?extension=vendor.my-app');

  await page.evaluate(() => {
    const { BitrixVue } = BX.Vue3;
    const { Counter } = BX.Vendor.MyApp;
    BitrixVue.createApp(Counter, { initial: 0 }).mount('#sandbox');
  });

  await page.click('[data-testid="increment"]');
  await page.click('[data-testid="increment"]');

  await expect(page.locator('[data-testid="count"]')).toHaveText('2');
});
```

### Ввод текста

```ts
test('should filter items by search', async ({ page }) => {
  await page.goto('/dev/ui/cli/component-wrapper.php?extension=vendor.my-app');

  await page.evaluate(() => {
    const { BitrixVue } = BX.Vue3;
    const { ItemList } = BX.Vendor.MyApp;
    BitrixVue.createApp(ItemList, {
      items: [
        { id: 1, name: 'Apple' },
        { id: 2, name: 'Banana' },
        { id: 3, name: 'Cherry' },
      ],
    }).mount('#sandbox');
  });

  await page.fill('[data-testid="search"]', 'Ban');

  await expect(page.locator('.item')).toHaveCount(1);
  await expect(page.locator('.item')).toHaveText('Banana');
});
```

### Проверка disabled-состояний

```ts
test('should disable button at max', async ({ page }) => {
  await page.goto('/dev/ui/cli/component-wrapper.php?extension=vendor.my-app');

  await page.evaluate(() => {
    const { BitrixVue } = BX.Vue3;
    const { Counter } = BX.Vendor.MyApp;
    BitrixVue.createApp(Counter, { initial: 5, max: 5 }).mount('#sandbox');
  });

  await expect(page.locator('[data-testid="increment"]')).toBeDisabled();
});
```

## Реактивные обновления

Vue-компоненты реактивны — изменения данных автоматически обновляют DOM. Playwright ждёт обновления при проверке:

```ts
test('should delete message', async ({ page }) => {
  await page.goto('/dev/ui/cli/component-wrapper.php?extension=vendor.my-app');

  await page.evaluate(() => {
    const { BitrixVue, ref } = BX.Vue3;
    const { MessageList } = BX.Vendor.MyApp;

    const messages = ref([
      { id: 1, author: 'Alice', text: 'Hello' },
      { id: 2, author: 'Bob', text: 'World' },
    ]);

    BitrixVue.createApp({
      components: { MessageList },
      setup() {
        function onDelete(id) {
          messages.value = messages.value.filter((m) => m.id !== id);
        }
        return { messages, onDelete };
      },
      template: '<MessageList :messages="messages" @deleteMessage="onDelete" />',
    }).mount('#sandbox');
  });

  await expect(page.locator('.message-item')).toHaveCount(2);
  await page.locator('[data-testid="delete"]').first().click();
  await expect(page.locator('.message-item')).toHaveCount(1);
});
```

## beforeEach для группы тестов

Используйте `test.beforeEach` чтобы не дублировать монтирование:

```ts
import { test, expect } from '@playwright/test';

test.describe('Counter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/ui/cli/component-wrapper.php?extension=vendor.my-app');

    await page.evaluate(() => {
      const { BitrixVue } = BX.Vue3;
      const { Counter } = BX.Vendor.MyApp;
      BitrixVue.createApp(Counter, { initial: 0, min: 0, max: 10 }).mount('#sandbox');
    });
  });

  test('should render initial value', async ({ page }) => {
    await expect(page.locator('[data-testid="count"]')).toHaveText('0');
  });

  test('should increment', async ({ page }) => {
    await page.click('[data-testid="increment"]');
    await expect(page.locator('[data-testid="count"]')).toHaveText('1');
  });

  test('should decrement', async ({ page }) => {
    await page.click('[data-testid="increment"]');
    await page.click('[data-testid="increment"]');
    await page.click('[data-testid="decrement"]');
    await expect(page.locator('[data-testid="count"]')).toHaveText('1');
  });

  test('should reset', async ({ page }) => {
    await page.click('[data-testid="increment"]');
    await page.click('[data-testid="reset"]');
    await expect(page.locator('[data-testid="count"]')).toHaveText('0');
  });
});
```

## Ожидание асинхронных данных

Если компонент загружает данные в `onMounted`, дождитесь появления элементов:

```ts
test('should load and display users', async ({ page }) => {
  await page.goto('/dev/ui/cli/component-wrapper.php?extension=vendor.my-app');

  await page.evaluate(() => {
    const { BitrixVue } = BX.Vue3;
    const { UserList } = BX.Vendor.MyApp;
    BitrixVue.createApp(UserList).mount('#sandbox');
  });

  // Ждём пока данные загрузятся и отрендерятся
  await expect(page.locator('.user-item').first()).toBeVisible();
  await expect(page.locator('.user-item')).toHaveCount(10);
});
```

## Unit vs E2E для Vue

| | Unit (`@vue/test-utils`) | E2E (Playwright) |
|---|---|---|
| **Скорость** | Быстро (миллисекунды) | Медленнее (секунды) |
| **Среда** | Реальный DOM, программный API | Реальный браузер, настоящие клики |
| **Что тестировать** | Логику компонента, пропсы, emit, computed | Визуальное поведение, пользовательские сценарии |
| **Зависимости** | `@vue/test-utils` | Только Playwright |
| **CSS** | Не загружается | Полноценная загрузка стилей |
