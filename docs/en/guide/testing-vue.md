# Testing Vue 3

A guide to unit testing extensions that use Vue 3 (`ui.vue3`). Chef runs tests in a real browser — components are mounted into a real DOM and work with the actual Vue from the `ui.vue3` extension.

## Installation

```bash
npm install --save-dev @vue/test-utils
```

[Vue Test Utils](https://test-utils.vuejs.org/) is the official library for unit testing Vue components. Chef automatically bundles it into the test code, while `vue` is taken from the loaded `ui.vue3` extension.

## Test structure

```
local/js/vendor/my-chat/
├── src/
│   ├── my-chat.ts
│   └── components/
│       ├── message-list.ts
│       ├── message-item.ts
│       └── chat-input.ts
└── test/
    └── unit/
        ├── message-list.test.ts
        ├── message-item.test.ts
        └── chat-input.test.ts
```

## Mounting components

### mount

`mount` creates a full component instance with all child components:

```ts
import { describe, it, afterEach } from 'mocha';
import { assert } from 'chai';
import { mount } from '@vue/test-utils';

import { MessageItem } from '../../src/components/message-item';

describe('MessageItem', () => {
  let wrapper;

  afterEach(() => {
    wrapper?.unmount();
  });

  it('should render message text', () => {
    wrapper = mount(MessageItem, {
      props: {
        author: 'John',
        text: 'Hello, world!',
        timestamp: Date.now(),
      },
    });

    assert.include(wrapper.text(), 'Hello, world!');
    assert.include(wrapper.text(), 'John');
  });
});
```

### shallowMount

`shallowMount` renders only the root component, replacing children with stubs. Useful for isolating the component under test:

```ts
import { shallowMount } from '@vue/test-utils';

import { MessageList } from '../../src/components/message-list';

it('should render correct number of messages', () => {
  const wrapper = shallowMount(MessageList, {
    props: {
      messages: [
        { id: 1, text: 'Hello' },
        { id: 2, text: 'World' },
      ],
    },
  });

  // Child MessageItem components are replaced with stubs
  assert.equal(wrapper.findAllComponents({ name: 'MessageItem' }).length, 2);
  wrapper.unmount();
});
```

::: tip When to use which
- **`mount`** — when you need to test child component interactions, DOM rendering
- **`shallowMount`** — when you need to isolate the logic of a single component
:::

## Testing events

### Custom events (emit)

```ts
import { mount } from '@vue/test-utils';

import { ChatInput } from '../../src/components/chat-input';

describe('ChatInput', () => {
  it('should emit send event on Enter', async () => {
    const wrapper = mount(ChatInput);

    const input = wrapper.find('textarea');
    await input.setValue('Hello!');
    await input.trigger('keydown.enter');

    const emitted = wrapper.emitted('send');
    assert.isArray(emitted);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0][0], 'Hello!');

    wrapper.unmount();
  });

  it('should not emit send on empty input', async () => {
    const wrapper = mount(ChatInput);

    await wrapper.find('textarea').trigger('keydown.enter');

    assert.isUndefined(wrapper.emitted('send'));
    wrapper.unmount();
  });
});
```

### Native DOM events

```ts
it('should handle click on delete button', async () => {
  const wrapper = mount(MessageItem, {
    props: { id: 1, text: 'Hello', author: 'John', timestamp: Date.now() },
  });

  await wrapper.find('.message-item__delete').trigger('click');

  const emitted = wrapper.emitted('delete');
  assert.deepEqual(emitted[0], [1]);
  wrapper.unmount();
});
```

## Testing props and reactivity

### Initial props

```ts
it('should render with initial props', () => {
  const wrapper = mount(UserBadge, {
    props: {
      name: 'Anna',
      role: 'admin',
      online: true,
    },
  });

  assert.include(wrapper.text(), 'Anna');
  assert.isTrue(wrapper.find('.badge--online').exists());
  wrapper.unmount();
});
```

### Changing props

```ts
it('should update on prop change', async () => {
  const wrapper = mount(Counter, {
    props: { value: 0 },
  });

  assert.include(wrapper.text(), '0');

  await wrapper.setProps({ value: 5 });
  assert.include(wrapper.text(), '5');

  await wrapper.setProps({ value: -1 });
  assert.include(wrapper.text(), '-1');

  wrapper.unmount();
});
```

### Checking computed properties

```ts
it('should compute full name', () => {
  const wrapper = mount(UserProfile, {
    props: { firstName: 'John', lastName: 'Doe' },
  });

  assert.include(wrapper.text(), 'John Doe');
  wrapper.unmount();
});
```

## Testing slots

### Default slot

```ts
it('should render default slot', () => {
  const wrapper = mount(Panel, {
    slots: {
      default: '<p>Panel content</p>',
    },
  });

  assert.include(wrapper.html(), 'Panel content');
  wrapper.unmount();
});
```

### Named slots

```ts
it('should render named slots', () => {
  const wrapper = mount(Dialog, {
    slots: {
      header: '<h2>Confirm</h2>',
      default: '<p>Are you sure?</p>',
      footer: '<button>OK</button><button>Cancel</button>',
    },
  });

  assert.include(wrapper.find('.dialog-header').html(), 'Confirm');
  assert.include(wrapper.find('.dialog-body').html(), 'Are you sure?');
  assert.equal(wrapper.findAll('.dialog-footer button').length, 2);

  wrapper.unmount();
});
```

### Scoped slots

```ts
it('should pass data to scoped slot', () => {
  const wrapper = mount(ItemList, {
    props: {
      items: [{ id: 1, name: 'First' }, { id: 2, name: 'Second' }],
    },
    slots: {
      item: `<template #item="{ item }">
        <span class="custom-item">{{ item.name }}</span>
      </template>`,
    },
  });

  const items = wrapper.findAll('.custom-item');
  assert.equal(items.length, 2);
  assert.equal(items[0].text(), 'First');

  wrapper.unmount();
});
```

## Testing with Vuex Store

### Creating a test store

```ts
import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import { mount } from '@vue/test-utils';
import { createStore } from 'ui.vue3.vuex';

import { ChatList } from '../../src/components/chat-list';

describe('ChatList', () => {
  let store;
  let wrapper;

  beforeEach(() => {
    store = createStore({
      state: () => ({
        chats: [
          { id: 1, title: 'General', counter: 3 },
          { id: 2, title: 'Support', counter: 0 },
          { id: 3, title: 'Dev', counter: 12 },
        ],
      }),
      getters: {
        unreadChats: (state) => state.chats.filter((c) => c.counter > 0),
        totalUnread: (state) => state.chats.reduce((sum, c) => sum + c.counter, 0),
      },
      mutations: {
        resetCounter(state, chatId) {
          const chat = state.chats.find((c) => c.id === chatId);
          if (chat) chat.counter = 0;
        },
      },
    });
  });

  afterEach(() => {
    wrapper?.unmount();
  });

  it('should render all chats', () => {
    wrapper = mount(ChatList, {
      global: { plugins: [store] },
    });

    assert.equal(wrapper.findAll('.chat-item').length, 3);
  });

  it('should highlight unread chats', () => {
    wrapper = mount(ChatList, {
      global: { plugins: [store] },
    });

    const unread = wrapper.findAll('.chat-item--unread');
    assert.equal(unread.length, 2);
  });

  it('should update after store mutation', async () => {
    wrapper = mount(ChatList, {
      global: { plugins: [store] },
    });

    store.commit('resetCounter', 1);
    await wrapper.vm.$nextTick();

    const unread = wrapper.findAll('.chat-item--unread');
    assert.equal(unread.length, 1);
  });
});
```

### Testing store separately

Stores can be tested without mounting components — this is faster and more reliable:

```ts
import { createStore } from 'ui.vue3.vuex';
import { chatModule } from '../../src/store/chat';

describe('chat store', () => {
  let store;

  beforeEach(() => {
    store = createStore({
      modules: { chat: chatModule },
    });
  });

  it('should add message', async () => {
    await store.dispatch('chat/addMessage', {
      chatId: 1,
      text: 'Hello',
      author: 'John',
    });

    const messages = store.getters['chat/getMessages'](1);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, 'Hello');
  });

  it('should increment counter on new message', async () => {
    await store.dispatch('chat/addMessage', {
      chatId: 1,
      text: 'Hello',
      author: 'John',
    });

    const counter = store.getters['chat/getCounter'](1);
    assert.equal(counter, 1);
  });

  it('should reset counter on read', async () => {
    await store.dispatch('chat/addMessage', { chatId: 1, text: 'Hello', author: 'John' });
    await store.dispatch('chat/markAsRead', { chatId: 1 });

    const counter = store.getters['chat/getCounter'](1);
    assert.equal(counter, 0);
  });
});
```

## Testing async behavior

### flushPromises

`flushPromises` waits for all pending promises to resolve — useful for tests with API calls:

```ts
import { mount, flushPromises } from '@vue/test-utils';

it('should load and display users', async () => {
  const wrapper = mount(UserList);

  // Component loads data in mounted()
  await flushPromises();

  assert.isAbove(wrapper.findAll('.user-item').length, 0);
  wrapper.unmount();
});
```

### nextTick

To wait for reactive DOM updates after data changes:

```ts
it('should toggle visibility', async () => {
  const wrapper = mount(Collapsible, {
    props: { title: 'Details' },
    slots: { default: '<p>Content</p>' },
  });

  assert.isFalse(wrapper.find('.content').exists());

  await wrapper.find('.toggle').trigger('click');
  assert.isTrue(wrapper.find('.content').exists());
  assert.include(wrapper.find('.content').text(), 'Content');

  wrapper.unmount();
});
```

## Mocks and stubs

### Component stubs

Replace heavy child components with stubs:

```ts
it('should render without heavy child', () => {
  const wrapper = mount(ChatWindow, {
    global: {
      stubs: {
        HeavyEditor: { template: '<div class="editor-stub"></div>' },
        EmojiPicker: true, // replaced with <emoji-picker-stub>
      },
    },
    props: { chatId: 1 },
  });

  assert.isTrue(wrapper.find('.editor-stub').exists());
  wrapper.unmount();
});
```

### Mocking provide/inject

```ts
it('should use injected service', () => {
  const mockService = {
    getCurrentUser: () => ({ id: 1, name: 'Test User' }),
  };

  const wrapper = mount(UserMenu, {
    global: {
      provide: {
        userService: mockService,
      },
    },
  });

  assert.include(wrapper.text(), 'Test User');
  wrapper.unmount();
});
```

### Mocking global properties ($Bitrix, $store)

```ts
it('should use $Bitrix.Loc', () => {
  const wrapper = mount(Greeting, {
    global: {
      mocks: {
        $Bitrix: {
          Loc: {
            getMessage: (key) => key === 'HELLO' ? 'Hello' : key,
          },
        },
      },
    },
  });

  assert.include(wrapper.text(), 'Hello');
  wrapper.unmount();
});
```

## Finding elements

### By CSS selector

```ts
wrapper.find('.message-item');           // single element
wrapper.findAll('.message-item');        // all elements
wrapper.find('[data-testid="submit"]');  // by data attribute
```

### By component

```ts
import { MessageItem } from '../../src/components/message-item';

wrapper.findComponent(MessageItem);                          // by reference
wrapper.findComponent({ name: 'MessageItem' });              // by name
wrapper.findAllComponents({ name: 'MessageItem' });          // all
```

### Checking existence

```ts
assert.isTrue(wrapper.find('.error').exists());
assert.isFalse(wrapper.find('.success').exists());
```

## Best practices

### Always unmount components

```ts
afterEach(() => {
  wrapper?.unmount();
});
```

This cleans up the DOM and prevents leaks between tests.

### Test behavior, not implementation

```ts
// Bad — tied to internal state
assert.equal(wrapper.vm.isOpen, true);

// Good — checks what the user sees
assert.isTrue(wrapper.find('.dropdown-menu').isVisible());
```

### Test store separately from components

Store is pure logic. Test actions, getters, mutations without mounting components. It's faster and more stable:

```ts
// Store test — fast, reliable
await store.dispatch('chat/sendMessage', { text: 'Hello' });
assert.equal(store.getters['chat/lastMessage'].text, 'Hello');

// Component test — only for verifying rendering
const wrapper = mount(ChatWindow, { global: { plugins: [store] } });
assert.include(wrapper.text(), 'Hello');
```

### Use data-testid for stable selectors

CSS classes can change during refactoring. `data-testid` explicitly marks elements for tests:

```ts
// In the component
template: '<button data-testid="send-btn" @click="send">Send</button>'

// In the test
await wrapper.find('[data-testid="send-btn"]').trigger('click');
```

### One test — one assertion

```ts
// Bad — unclear what broke on failure
it('should work', async () => {
  assert.include(wrapper.text(), 'Title');
  await wrapper.find('.btn').trigger('click');
  assert.isTrue(wrapper.emitted('submit') !== undefined);
  assert.equal(wrapper.findAll('.item').length, 3);
});

// Good — each test checks specific behavior
it('should render title', () => { /* ... */ });
it('should emit submit on button click', async () => { /* ... */ });
it('should render all items', () => { /* ... */ });
```
