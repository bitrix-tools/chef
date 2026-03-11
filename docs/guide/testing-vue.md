# Тестирование Vue 3

Руководство по unit-тестированию расширений, использующих Vue 3 (`ui.vue3`). Chef запускает тесты в реальном браузере — компоненты монтируются в настоящий DOM и работают с реальным Vue из расширения `ui.vue3`.

## Установка

```bash
npm install --save-dev @vue/test-utils
```

[Vue Test Utils](https://test-utils.vuejs.org/) — официальная библиотека для unit-тестирования Vue-компонентов. Chef автоматически бандлит её в тестовый код, а `vue` берётся из загруженного расширения `ui.vue3`.

## Структура тестов

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

## Монтирование компонентов

### mount

`mount` создаёт полноценный экземпляр компонента со всеми дочерними компонентами:

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

`shallowMount` рендерит только корневой компонент, заменяя дочерние на заглушки. Полезно для изоляции тестируемого компонента:

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

  // Дочерние MessageItem заменены заглушками
  assert.equal(wrapper.findAllComponents({ name: 'MessageItem' }).length, 2);
  wrapper.unmount();
});
```

::: tip Когда что использовать
- **`mount`** — когда нужно проверить взаимодействие дочерних компонентов, рендеринг DOM
- **`shallowMount`** — когда нужно изолировать логику одного компонента
:::

## Тестирование событий

### Пользовательские события (emit)

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

### Нативные DOM-события

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

## Тестирование пропсов и реактивности

### Начальные пропсы

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

### Изменение пропсов

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

### Проверка computed-свойств

```ts
it('should compute full name', () => {
  const wrapper = mount(UserProfile, {
    props: { firstName: 'John', lastName: 'Doe' },
  });

  assert.include(wrapper.text(), 'John Doe');
  wrapper.unmount();
});
```

## Тестирование слотов

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

### Именованные слоты

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

## Тестирование с Vuex Store

### Создание тестового store

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

### Тестирование store отдельно

Store можно тестировать без монтирования компонентов — это быстрее и надёжнее:

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

## Тестирование асинхронного поведения

### flushPromises

`flushPromises` ожидает завершения всех pending промисов — полезно для тестов с API-запросами:

```ts
import { mount, flushPromises } from '@vue/test-utils';

it('should load and display users', async () => {
  const wrapper = mount(UserList);

  // Компонент загружает данные в mounted()
  await flushPromises();

  assert.isAbove(wrapper.findAll('.user-item').length, 0);
  wrapper.unmount();
});
```

### nextTick

Для ожидания реактивного обновления DOM после изменения данных:

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

## Моки и заглушки

### Мок компонентов

Замена тяжёлых дочерних компонентов на заглушки:

```ts
it('should render without heavy child', () => {
  const wrapper = mount(ChatWindow, {
    global: {
      stubs: {
        HeavyEditor: { template: '<div class="editor-stub"></div>' },
        EmojiPicker: true, // заменяется на <emoji-picker-stub>
      },
    },
    props: { chatId: 1 },
  });

  assert.isTrue(wrapper.find('.editor-stub').exists());
  wrapper.unmount();
});
```

### Мок provide/inject

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

### Мок глобальных свойств ($Bitrix, $store)

```ts
it('should use $Bitrix.Loc', () => {
  const wrapper = mount(Greeting, {
    global: {
      mocks: {
        $Bitrix: {
          Loc: {
            getMessage: (key) => key === 'HELLO' ? 'Привет' : key,
          },
        },
      },
    },
  });

  assert.include(wrapper.text(), 'Привет');
  wrapper.unmount();
});
```

## Поиск элементов

### По CSS-селектору

```ts
wrapper.find('.message-item');           // один элемент
wrapper.findAll('.message-item');        // все элементы
wrapper.find('[data-testid="submit"]');  // по data-атрибуту
```

### По компоненту

```ts
import { MessageItem } from '../../src/components/message-item';

wrapper.findComponent(MessageItem);                          // по ссылке
wrapper.findComponent({ name: 'MessageItem' });              // по имени
wrapper.findAllComponents({ name: 'MessageItem' });          // все
```

### Проверка существования

```ts
assert.isTrue(wrapper.find('.error').exists());
assert.isFalse(wrapper.find('.success').exists());
```

## Лучшие практики

### Всегда размонтируйте компоненты

```ts
afterEach(() => {
  wrapper?.unmount();
});
```

Это очищает DOM и предотвращает утечки между тестами.

### Тестируйте поведение, не реализацию

```ts
// Плохо — завязано на внутреннее состояние
assert.equal(wrapper.vm.isOpen, true);

// Хорошо — проверяет что видит пользователь
assert.isTrue(wrapper.find('.dropdown-menu').isVisible());
```

### Тестируйте store отдельно от компонентов

Store — это чистая логика. Тестируйте actions, getters, mutations без монтирования компонентов. Это быстрее и стабильнее:

```ts
// Store test — быстрый, надёжный
await store.dispatch('chat/sendMessage', { text: 'Hello' });
assert.equal(store.getters['chat/lastMessage'].text, 'Hello');

// Component test — только для проверки рендеринга
const wrapper = mount(ChatWindow, { global: { plugins: [store] } });
assert.include(wrapper.text(), 'Hello');
```

### Используйте data-testid для стабильных селекторов

CSS-классы могут меняться при рефакторинге. `data-testid` явно обозначает элемент для тестов:

```ts
// В компоненте
template: '<button data-testid="send-btn" @click="send">Send</button>'

// В тесте
await wrapper.find('[data-testid="send-btn"]').trigger('click');
```

### Один тест — одна проверка

```ts
// Плохо — непонятно что сломалось при падении
it('should work', async () => {
  assert.include(wrapper.text(), 'Title');
  await wrapper.find('.btn').trigger('click');
  assert.isTrue(wrapper.emitted('submit') !== undefined);
  assert.equal(wrapper.findAll('.item').length, 3);
});

// Хорошо — каждый тест проверяет конкретное поведение
it('should render title', () => { /* ... */ });
it('should emit submit on button click', async () => { /* ... */ });
it('should render all items', () => { /* ... */ });
```
