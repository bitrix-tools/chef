# Vue 3

Chef supports building Vue 3 components. Vue and all its APIs are imported from the Bitrix extension `ui.vue3`.

## Quick Start

### Extension Structure

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

Standard config — nothing special for Vue:

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

### Entry Point

```ts
// src/index.ts
import { BitrixVue } from 'ui.vue3';

import { MyWidget } from './components/my-widget';
import { UserCard } from './components/user-card';

BitrixVue.component('vendor-my-widget', MyWidget);
BitrixVue.component('vendor-user-card', UserCard);
```

`BitrixVue.component()` registers the component globally in the Bitrix Vue application. After that it can be used in any Vue app on the page.

## Components

Vue components in Bitrix are regular JS/TS files exporting a component object. The template is specified in the `template` property:

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

The `// @vue/component` comment before the component object helps IDEs (WebStorm, VS Code with Volar) recognize the Vue component and enable autocompletion for `template`, `props`, `computed` and other options.

### Nested Components

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

### Importing Bitrix Extensions

Components use standard imports from Bitrix extensions — dependencies are resolved automatically during build:

```ts
import { Type, Loc, Event } from 'main.core';
import { EventEmitter } from 'main.core.events';
import { DateTimeFormat } from 'main.date';
```

## Using on a Page

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

## Production Mode

```bash
chef build vendor.my-widget --production
```

In production mode the Vue compiler runs with the `isProduction` flag:
- **Dev** — components include `__file` with the source path (for Vue Devtools)
- **Production** — `__file` is removed, the bundle is minified, source maps are disabled

## Single File Components (SFC)

In addition to the primary approach with JS/TS files, Chef supports building Single File Components — `.vue` files where template, logic and styles are combined in a single file. Chef automatically detects `.vue` files in `src/` and enables the Vue compiler.

### SFC Example

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

### Entry Point with SFC

```ts
// src/index.ts
import { BitrixVue } from 'ui.vue3';
import Counter from './components/Counter.vue';

BitrixVue.component('ui-counter', Counter);
```

### `<script lang="ts">` Block

TypeScript in SFC is supported via the `lang="ts"` attribute:

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

### `<style>` Block

Styles from `<style>` are extracted into the CSS bundle:

```vue
<style>
.user-card {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
```

::: tip Scoped styles
`<style scoped>` is also supported — Vue will add unique `data-v-*` attributes for style isolation.
:::

### Typing .vue Files

For TypeScript to work correctly with `.vue` imports, a module declaration is needed. Chef provides it through the `ui.dev` extension — if `tsconfig.json` is configured in your project (via `chef init build`), `.vue` file typing works out of the box.

If your IDE shows an error on `import Component from './Component.vue'`, make sure:

1. You have run `chef init build`
2. Your `tsconfig.json` includes `types` pointing to `ui.dev`

### When to Use SFC

SFC are convenient when the template and styles are tightly coupled with the component and it makes sense to keep them together. However, most Bitrix extensions use the approach with JS/TS files and inline `template` — it's simpler for integration, doesn't require additional type support, and such components are easier to debug.
