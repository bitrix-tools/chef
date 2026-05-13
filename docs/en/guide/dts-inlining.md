# .d.ts Type Inlining

When chef builds an extension it generates a `.d.ts` with the types exposed to consumers. TypeScript's declaration emit keeps references to sibling extensions like `ui.icon-set.api.vue.BIcon` — but only when the export carries an explicit type annotation.

Without an annotation TypeScript **expands** the type's full shape into your `.d.ts`. The link to the original symbol is lost. This is what we call inlining.

Chef detects such cases and prints a `CHEF_DTS` warning pointing to the exact source line.

## Why it's a problem

A single inlined Vue component adds ~30 lines to your `.d.ts`. A handful of those and your public `.d.ts` bloats by a factor of ten.

When the sibling extension changes (`BIcon` gets a new prop), your inlined `.d.ts` keeps the old copy until rebuilt. Consumers see a stale type.

IDEs show the expanded shape in tooltips instead of the short `ui.icon-set.api.vue.BIcon` reference — go-to-definition stops working.

## Inline kinds and how to fix them

### `vue-components` — `components: { BIcon }` without annotation

The most common case in Vue extensions. The `components` map inside `defineComponent({...})` expands every entry to the full `DefineComponent<...>` structure when there's no annotation.

**Without annotation (gets inlined):**

```ts
import { defineComponent } from 'ui.vue3';
import { BIcon } from 'ui.icon-set.api.vue';

export const MyToolbar = defineComponent({
  components: { BIcon },
  // ...
});
```

The full component shape lands in your `.d.ts`:

```ts
export declare const MyToolbar: DefineComponent<..., {
  BIcon: {
    props: {
      name: { type: StringConstructor; required: boolean };
      color: { type: StringConstructor; required: false; default: null };
      size: { type: NumberConstructor; required: false; default: null };
      // ...every other BIcon prop...
    };
    template: string;
  };
}, ...>;
```

**With annotation (reference preserved):**

```ts
export const MyToolbar = defineComponent({
  components: { BIcon } as { BIcon: typeof BIcon },
  // ...
});
```

The `.d.ts` keeps a short reference:

```ts
export declare const MyToolbar: DefineComponent<..., {
  BIcon: typeof BIcon;
}, ...>;
```

The `as { BIcon: typeof BIcon }` cast pins the map's type and TypeScript keeps the original-symbol reference.

### `computed-arrow` — `(): typeof X => X` inside `computed`

Arrow functions inside `computed` can lose the return-type link during declaration emit.

**Without annotation (gets inlined):**

```ts
computed: {
  icons: () => Outline,
},
```

The object's full shape lands in the `.d.ts`:

```ts
icons: () => Readonly<{
  ACTIVITY: "o-activity";
  ACHIEVEMENT: "o-achievement";
  ALARM: "o-alarm";
  // ...every other Outline key...
}>;
```

**With annotation (reference preserved):**

```ts
computed: {
  icons(): typeof Outline
  {
    return Outline;
  },
},
```

In `.d.ts`:

```ts
icons(): typeof Outline;
```

A regular method with an explicit return type preserves the reference more reliably than an arrow.

### `export-const` — `export const X = ...` without annotation

A top-level export without an explicit type — TypeScript infers it and writes the expanded shape.

**Without annotation (gets inlined):**

```ts
import { Outline } from 'ui.icon-set.api.vue';

export const MyIcons = Outline;
```

In `.d.ts`:

```ts
export declare const MyIcons: Readonly<{
  ACTIVITY: "o-activity";
  ACHIEVEMENT: "o-achievement";
  ALARM: "o-alarm";
  // ...
}>;
```

**With annotation (reference preserved):**

```ts
export const MyIcons: typeof Outline = Outline;
```

In `.d.ts`:

```ts
export declare const MyIcons: typeof Outline;
```

### Generic case

If none of the recipes fit, add `: typeof X` at the indicated line. That always produces a reference instead of an inline.

## When there's no inlining

Not every use of an imported value triggers an inline. TypeScript keeps the reference **without any annotation** when:

- the value is **passed through** and the function already carries a return-type annotation:

  ```ts
  import { Outline } from 'ui.icon-set.api.vue';

  export function getIcons(): typeof Outline {
    return Outline;
  }
  ```

- the imported type is used in a **type position** (rather than as a value):

  ```ts
  import type { Set } from 'ui.icon-set.api.core';

  export function pickIcon(set: Set): void { /* ... */ }
  ```

- it's a **named class** — it has a name of its own, and TypeScript references it by name:

  ```ts
  import { IconClass } from 'ui.icon-set.api.core';

  export function make() {
    return new IconClass();
  }
  // → export declare function make(): IconClass;
  ```

If your `.d.ts` already shows a short reference like `typeof Foo` or `Foo`, no annotation is needed.

## When the warning is a false positive

Chef sometimes flags an inline where there isn't one — usually around structurally equivalent empty objects. If a recipe clearly doesn't help and the message looks like a false positive, please open an issue with a minimal reproduction: [github.com/bitrix-tools/chef/issues](https://github.com/bitrix-tools/chef/issues).

## See also

- [TypeScript](/en/guide/typescript) — general TS setup in chef
- [Error Codes](/en/guide/errors#CHEF_DTS) — full diagnostics catalogue
