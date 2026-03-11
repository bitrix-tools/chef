# E2E Tests Vue 3

A guide to e2e testing extensions that use Vue 3 (`ui.vue3`). Tests run via Playwright in a real browser — components are mounted into a real DOM and work with the actual Vue from the `ui.vue3` extension.

## How it works

1. Open [Component Sandbox](/en/guide/testing-sandbox) with the required extension
2. Mount a Vue component via `page.evaluate()` and `BitrixVue.createApp()`
3. Interact with the component via Playwright (clicks, text input)
4. Verify the result with `expect`

## Structure

```
local/js/vendor/my-app/
└── test/
    └── e2e/
        ├── counter.spec.ts
        └── message-list.spec.ts
```

## Mounting a component

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

## Interacting with components

### Clicks

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

### Text input

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

### Checking disabled states

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

## Reactive updates

Vue components are reactive — data changes automatically update the DOM. Playwright waits for updates when asserting:

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

## beforeEach for test groups

Use `test.beforeEach` to avoid duplicating the mount logic:

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

## Waiting for async data

If a component loads data in `onMounted`, wait for elements to appear:

```ts
test('should load and display users', async ({ page }) => {
  await page.goto('/dev/ui/cli/component-wrapper.php?extension=vendor.my-app');

  await page.evaluate(() => {
    const { BitrixVue } = BX.Vue3;
    const { UserList } = BX.Vendor.MyApp;
    BitrixVue.createApp(UserList).mount('#sandbox');
  });

  // Wait for data to load and render
  await expect(page.locator('.user-item').first()).toBeVisible();
  await expect(page.locator('.user-item')).toHaveCount(10);
});
```

## Unit vs E2E for Vue

| | Unit (`@vue/test-utils`) | E2E (Playwright) |
|---|---|---|
| **Speed** | Fast (milliseconds) | Slower (seconds) |
| **Environment** | Real DOM, programmatic API | Real browser, actual clicks |
| **What to test** | Component logic, props, emit, computed | Visual behavior, user scenarios |
| **Dependencies** | `@vue/test-utils` | Playwright only |
| **CSS** | Not loaded | Full style loading |
