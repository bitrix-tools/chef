# E2E Tests Vue 3

A guide to e2e testing extensions that use Vue 3 (`ui.vue3`). Tests run via Playwright in a real browser — components are mounted into a real DOM and work with the actual Vue from the `ui.vue3` extension.

## How it works

1. Load the extension via [sandbox.loadExtension()](/en/guide/testing-sandbox)
2. Mount a Vue component via `sandbox.mount()` and `BitrixVue.createApp()`
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
import { test, expect } from 'ui.test.e2e.sandbox';

test('should render counter', async ({ sandbox }) => {
  await sandbox.loadExtension('vendor.my-app');

  await sandbox.mount((selector) => {
    const { BitrixVue } = BX.Vue3;
    const { Counter } = BX.Vendor.MyApp;
    BitrixVue.createApp(Counter, { initial: 5 }).mount(selector);
  });

  await expect(sandbox.page.locator('[data-testid="count"]')).toHaveText('5');
});
```

## Interacting with components

### Clicks

```ts
test('should increment on click', async ({ sandbox }) => {
  await sandbox.loadExtension('vendor.my-app');

  await sandbox.mount((selector) => {
    const { BitrixVue } = BX.Vue3;
    const { Counter } = BX.Vendor.MyApp;
    BitrixVue.createApp(Counter, { initial: 0 }).mount(selector);
  });

  await sandbox.page.click('[data-testid="increment"]');
  await sandbox.page.click('[data-testid="increment"]');

  await expect(sandbox.page.locator('[data-testid="count"]')).toHaveText('2');
});
```

### Text input

```ts
test('should filter items by search', async ({ sandbox }) => {
  await sandbox.loadExtension('vendor.my-app');

  await sandbox.mount((selector) => {
    const { BitrixVue } = BX.Vue3;
    const { ItemList } = BX.Vendor.MyApp;
    BitrixVue.createApp(ItemList, {
      items: [
        { id: 1, name: 'Apple' },
        { id: 2, name: 'Banana' },
        { id: 3, name: 'Cherry' },
      ],
    }).mount(selector);
  });

  await sandbox.page.fill('[data-testid="search"]', 'Ban');

  await expect(sandbox.page.locator('.item')).toHaveCount(1);
  await expect(sandbox.page.locator('.item')).toHaveText('Banana');
});
```

### Checking disabled states

```ts
test('should disable button at max', async ({ sandbox }) => {
  await sandbox.loadExtension('vendor.my-app');

  await sandbox.mount((selector) => {
    const { BitrixVue } = BX.Vue3;
    const { Counter } = BX.Vendor.MyApp;
    BitrixVue.createApp(Counter, { initial: 5, max: 5 }).mount(selector);
  });

  await expect(sandbox.page.locator('[data-testid="increment"]')).toBeDisabled();
});
```

## Reactive updates

Vue components are reactive — data changes automatically update the DOM. Playwright waits for updates when asserting:

```ts
test('should delete message', async ({ sandbox }) => {
  await sandbox.loadExtension('vendor.my-app');

  await sandbox.mount((selector) => {
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
    }).mount(selector);
  });

  await expect(sandbox.page.locator('.message-item')).toHaveCount(2);
  await sandbox.page.locator('[data-testid="delete"]').first().click();
  await expect(sandbox.page.locator('.message-item')).toHaveCount(1);
});
```

## beforeEach for test groups

Use `test.beforeEach` to avoid duplicating the load and mount logic:

```ts
import { test, expect } from 'ui.test.e2e.sandbox';

test.describe('Counter', () => {
  test.beforeEach(async ({ sandbox }) => {
    await sandbox.loadExtension('vendor.my-app');

    await sandbox.mount((selector) => {
      const { BitrixVue } = BX.Vue3;
      const { Counter } = BX.Vendor.MyApp;
      BitrixVue.createApp(Counter, { initial: 0, min: 0, max: 10 }).mount(selector);
    });
  });

  test('should render initial value', async ({ sandbox }) => {
    await expect(sandbox.page.locator('[data-testid="count"]')).toHaveText('0');
  });

  test('should increment', async ({ sandbox }) => {
    await sandbox.page.click('[data-testid="increment"]');
    await expect(sandbox.page.locator('[data-testid="count"]')).toHaveText('1');
  });

  test('should decrement', async ({ sandbox }) => {
    await sandbox.page.click('[data-testid="increment"]');
    await sandbox.page.click('[data-testid="increment"]');
    await sandbox.page.click('[data-testid="decrement"]');
    await expect(sandbox.page.locator('[data-testid="count"]')).toHaveText('1');
  });

  test('should reset', async ({ sandbox }) => {
    await sandbox.page.click('[data-testid="increment"]');
    await sandbox.page.click('[data-testid="reset"]');
    await expect(sandbox.page.locator('[data-testid="count"]')).toHaveText('0');
  });
});
```

## Waiting for async data

If a component loads data in `onMounted`, wait for elements to appear:

```ts
test('should load and display users', async ({ sandbox }) => {
  await sandbox.loadExtension('vendor.my-app');

  await sandbox.mount((selector) => {
    const { BitrixVue } = BX.Vue3;
    const { UserList } = BX.Vendor.MyApp;
    BitrixVue.createApp(UserList).mount(selector);
  });

  // Wait for data to load and render
  await expect(sandbox.page.locator('.user-item').first()).toBeVisible();
  await expect(sandbox.page.locator('.user-item')).toHaveCount(10);
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
