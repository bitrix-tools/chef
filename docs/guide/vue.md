# Vue 3

Chef поддерживает сборку компонентов [Vue 3](https://vuejs.org/). Vue и все его API импортируются из Bitrix-расширения `ui.vue3`.

## Быстрый старт

### Структура расширения

```
local/js/vendor/my-widget/
├── bundle.config.ts
├── config.php
├── src/
│   ├── index.ts
│   └── components/
│       ├── my-widget.ts
│       └── user-card.ts
└── dist/
```

### bundle.config.ts

Стандартный конфиг — ничего специального для Vue добавлять не нужно:

```ts
export default {
  input: 'src/index.ts',
  output: {
    js: 'dist/my-widget.bundle.js',
    css: 'dist/my-widget.bundle.css',
  },
  namespace: 'BX.Vendor.MyWidget',
};
```

### Точка входа

```ts
// src/index.ts
import { BitrixVue } from 'ui.vue3';

import { MyWidget } from './components/my-widget';
import { UserCard } from './components/user-card';

BitrixVue.component('vendor-my-widget', MyWidget);
BitrixVue.component('vendor-user-card', UserCard);
```

`BitrixVue.component()` регистрирует компонент глобально в приложении Bitrix Vue. После этого его можно использовать в любом Vue-приложении на странице.

## Компоненты

Vue-компоненты в Bitrix — обычные JS/TS-файлы, экспортирующие объект компонента. Шаблон указывается в свойстве `template`:

```ts
// src/components/user-card.ts
import { Loc } from 'main.core';

// @vue/component
export const UserCard = {
  name: 'UserCard',
  props: {
    userId: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
  },
  emits: ['select'],
  computed: {
    formattedName(): string
    {
      return this.name.trim();
    },
  },
  methods: {
    handleClick(): void
    {
      this.$emit('select', this.userId);
    },
  },
  template: `
    <div class="user-card" @click="handleClick">
      <span class="user-card__name">{{ formattedName }}</span>
    </div>
  `,
};
```

Комментарий `// @vue/component` перед объектом компонента позволяет IDE (WebStorm, VS Code с Volar) распознавать Vue-компонент и включать автодополнение для `template`, `props`, `computed` и других опций.

### Вложенные компоненты

```ts
// src/components/my-widget.ts
import { UserCard } from './user-card';

// @vue/component
export const MyWidget = {
  name: 'MyWidget',
  components: { UserCard },
  data(): { users: Array<{ id: number; name: string }> }
  {
    return {
      users: [],
    };
  },
  methods: {
    onUserSelect(userId: number): void
    {
      console.log('Selected:', userId);
    },
  },
  template: `
    <div class="my-widget">
      <UserCard
        v-for="user in users"
        :key="user.id"
        :userId="user.id"
        :name="user.name"
        @select="onUserSelect"
      />
    </div>
  `,
};
```

### Импорт Bitrix-расширений

В компонентах используются стандартные импорты из расширений Bitrix — зависимости определяются автоматически при сборке:

```ts
import { Type, Loc, Event } from 'main.core';
import { EventEmitter } from 'main.core.events';
import { DateTimeFormat } from 'main.date';
```

## Подключение на страницу

```php
<?php
\Bitrix\Main\UI\Extension::load('vendor.my-widget');
?>

<div id="app">
  <vendor-my-widget />
</div>

<script>
BX.Vue3.BitrixVue.createApp({
  el: '#app',
});
</script>
```

## Production-режим

```bash
chef build vendor.my-widget --production
```

В production-режиме Vue-компилятор работает с флагом `isProduction`:
- **Dev** — в компонентах добавляется `__file` с путём к исходнику (для Vue Devtools)
- **Production** — `__file` удаляется, бандл минифицируется, source maps отключаются

## Single File Components (SFC)

Помимо основного подхода с JS/TS-файлами, Chef поддерживает сборку Single File Components — `.vue` файлов, где шаблон, логика и стили объединены в одном файле. Chef автоматически обнаруживает `.vue` файлы в `src/` и подключает Vue-компилятор.

### Пример SFC

```vue
<!-- src/components/Counter.vue -->
<template>
  <div class="counter">
    <span>{{ count }}</span>
    <button @click="increment">+</button>
  </div>
</template>

<script lang="ts">
export default {
  name: 'Counter',
  data(): { count: number }
  {
    return {
      count: 0,
    };
  },
  methods: {
    increment(): void
    {
      this.count++;
    },
  },
};
</script>

<style>
.counter {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
```

### Точка входа с SFC

```ts
// src/index.ts
import { BitrixVue } from 'ui.vue3';
import Counter from './components/Counter.vue';

BitrixVue.component('ui-counter', Counter);
```

### Блок `<script lang="ts">`

TypeScript в SFC поддерживается через атрибут `lang="ts"`:

```vue
<script lang="ts">
import { defineComponent, type PropType } from 'ui.vue3';

interface User
{
  name: string;
  avatar: string;
}

export default defineComponent({
  name: 'UserCard',
  props: {
    user: {
      type: Object as PropType<User>,
      required: true,
    },
  },
});
</script>
```

### Блок `<style>`

Стили из `<style>` извлекаются в CSS-бандл:

```vue
<style>
.user-card {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
```

::: tip Scoped стили
`<style scoped>` тоже поддерживается — Vue добавит уникальные `data-v-*` атрибуты для изоляции стилей.
:::

### Типизация .vue файлов

Для корректной работы TypeScript с `.vue` импортами нужна декларация модуля. Chef предоставляет её через расширение `ui.dev` — если в проекте настроен `tsconfig.json` (через `chef init build`), типизация `.vue` файлов работает из коробки.

Если IDE подсвечивает ошибку на `import Component from './Component.vue'`, убедитесь что:

1. Выполнена команда `chef init build`
2. В `tsconfig.json` указан `types` на `ui.dev`

### Когда использовать SFC

SFC удобны когда шаблон и стили тесно связаны с компонентом, и их удобнее хранить рядом. Однако в большинстве Bitrix-расширений используется подход с JS/TS-файлами и `template` в строке — это проще для интеграции, не требует дополнительной поддержки типов, и такие компоненты легче отлаживать.
