# Unit Tests

Unit tests are written with Mocha + Chai and run in a real browser. The extension source code is compiled and loaded on the page alongside the tests — the actual bundle is tested as it would work in the browser.

## Structure

```
local/js/vendor/my-extension/
└── test/
    └── unit/
        ├── my-extension.test.ts
        └── utils.test.ts
```

## Basic Test

```ts
// test/unit/my-extension.test.ts
import { describe, it, beforeEach } from 'mocha';
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

## DOM Testing

Tests run in the browser, so you have full DOM access:

```ts
import { describe, it, beforeEach, afterEach } from 'mocha';
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

## Async Testing

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

## EventEmitter Testing

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
