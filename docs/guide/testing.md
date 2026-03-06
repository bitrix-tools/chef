# Testing

Chef runs tests in a real browser via [Playwright](https://playwright.dev/). Two types of tests are supported: unit tests ([Mocha](https://mochajs.org/) + [Chai](https://www.chaijs.com/)) and E2E tests (Playwright Test API).

## Setup

Initialize the test environment:

```bash
chef init tests
```

This creates `playwright.config.ts` and `.env.test` in the project root. See [Test Setup](/guide/test-setup) for details.

Install Playwright browsers:

```bash
npx playwright install
```

## Unit Tests

Unit tests are written with Mocha + Chai and run in a real browser. The extension source code is compiled and loaded on the page alongside the tests — the actual bundle is tested as it would work in the browser.

### Structure

```
local/js/vendor/my-extension/
└── test/
    └── unit/
        ├── my-extension.test.ts
        └── utils.test.ts
```

### Basic Test

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

### DOM Testing

Tests run in the browser, so you have full DOM access:

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

### Async Testing

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

### EventEmitter Testing

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

### Test Types

`mocha`, `chai` and their types are included in Chef and used when running `chef test`. For IDE autocompletion, install the types locally:

```bash
npm install --save-dev @types/mocha @types/chai
```

## E2E Tests

E2E tests use the [Playwright Test API](https://playwright.dev/docs/api/class-test) and run in a real browser on an actual Bitrix page.

### Structure

```
local/js/vendor/my-extension/
└── test/
    └── e2e/
        ├── my-extension.spec.ts
        └── navigation.spec.ts
```

### Basic Test

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
  await expect(popup).toContainText('Settings');
});
```

### Authenticated Tests

For pages that require authentication, import `test` from `ui.test.e2e.auth`. Before each test, automatic login will be performed using credentials from `.env.test`:

```ts
import { test, expect } from 'ui.test.e2e.auth';

test('admin panel is accessible', async ({ page }) => {
  // page is already authenticated
  await page.goto('/bitrix/admin/');

  await expect(page.locator('.adm-header')).toBeVisible();
});
```

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

  // Wait for AJAX request to complete
  const response = page.waitForResponse('**/ajax/**');
  await page.click('.load-more');
  await response;

  const items = page.locator('.item-card');
  await expect(items).toHaveCount(20);
});
```

## Running Tests

```bash
# All tests for an extension
chef test vendor.my-extension

# Unit tests only
chef test unit vendor.my-extension

# E2E tests only
chef test e2e vendor.my-extension

# Specific file
chef test unit vendor.my-extension ./utils.test.ts

# Tests matching pattern
chef test vendor.* --grep "should render"

# Watch mode — rerun on changes
chef test vendor.my-extension -w
```

### Debugging

```bash
# Open browser with DevTools
chef test vendor.my-extension --debug

# With visible browser window
chef test vendor.my-extension --headed

# In a specific browser
chef test vendor.my-extension --project chromium
```

In `--debug` mode, source maps are enabled and DevTools are opened — you can set breakpoints directly in your TypeScript source code.

## Tips

### Test Isolation

Each test should be independent. Use `beforeEach`/`afterEach` for setup and cleanup:

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
    // Does not depend on the previous test
    assert.equal(list.getCount(), 0);
  });
});
```

### Test Organization

Group tests by functionality:

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
