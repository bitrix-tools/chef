# Flow.js → TypeScript

The `chef flow-to-ts` command automatically converts extensions with [Flow.js](https://flow.org/) type annotations to TypeScript. It processes `.js` files inside extensions — renaming them to `.ts`, converting type syntax, and updating `bundle.config`.

## Quick start

```bash
chef flow-to-ts
```

The command finds all extensions in the current directory and for each one:

1. Renames `.js` → `.ts` via `hg rename`
2. Converts Flow syntax to TypeScript
3. Updates `bundle.config.js` → `bundle.config.ts` with the new entry point

## Options

```bash
chef flow-to-ts [extensions...] [options]
```

| Option | Description |
|--------|-------------|
| `extensions` | Extension names or glob patterns (`main.core`, `ui.bbcode.*`) |
| `-p, --path [path]` | Migrate a specific directory |
| `--rm-ts` | Remove existing `.ts` files before migration |
| `--rm-js` | Remove original `.js` files after migration |

```bash
chef flow-to-ts                         # All extensions in current directory
chef flow-to-ts ui.tabs ui.buttons      # Specific extensions
chef flow-to-ts ui.bbcode.*             # By pattern
chef flow-to-ts -p ./local/js/ui/tabs   # Specific directory
```

::: tip
In zsh, escape glob patterns to prevent shell expansion: `chef flow-to-ts ui.\*`
:::

## What gets converted

### Comments

Flow directives and comments are replaced with TypeScript equivalents:

```js
// @flow                    →  (removed)
// $FlowFixMe              →  // @ts-expect-error
// $FlowIgnore             →  // @ts-ignore
// $FlowExpectError        →  // @ts-expect-error
// $FlowIssue              →  (removed)
```

### Imports

`import typeof` is converted to `import type`:

```js
// Flow
import typeof Type from 'main.core';
import typeof { Type2 } from 'main.core';
import { typeof Type3 } from 'main.core';
import {
  typeof Type4,
  typeof Runtime,
  Tag,
  Dom,
  typeof Reflection,
} from 'main.core';
```

```ts
// TypeScript
import type Type from 'main.core';
import type { Type2 } from 'main.core';
import { type Type3 } from 'main.core';
import { type Type4, type Runtime, Tag, Dom, type Reflection } from 'main.core';
```

### Types

#### Basic types

| Flow | TypeScript | Description |
|------|-----------|-------------|
| `*` | `any` | Existential type |
| `mixed` | `unknown` | Unknown type |
| `?T` | `T \| null \| undefined` | Nullable type |
| `?function` | `function \| null \| undefined` | Nullable function |

```js
// Flow
function process(value: mixed): ?string
{
  if (typeof value === 'string')
  {
    return value;
  }

  return null;
}
```

```ts
// TypeScript
function process(value: unknown): string | null | undefined
{
  if (typeof value === 'string')
  {
    return value;
  }

  return null;
}
```

#### Utility types

| Flow | TypeScript | Description |
|------|-----------|-------------|
| `$Exact<T>` | `T` | Exact type (default in TS) |
| `$Shape<T>` | `Partial<T>` | All fields optional |
| `$ReadOnly<T>` | `Readonly<T>` | All fields readonly |
| `$ReadOnlyArray<T>` | `ReadonlyArray<T>` | Immutable array |
| `$NonMaybeType<T>` | `NonNullable<T>` | Exclude null/undefined |
| `$Call<F>` | `ReturnType<F>` | Function return type |
| `$Values<T>` | `T[keyof T]` | Object values as union |
| `$Keys<T>` | `keyof T` | Object keys as union |
| `$Diff<T, U>` | `Omit<T, keyof U>` | Exclude U fields from T |
| `$PropertyType<T, K>` | `T[K]` | Property type |
| `$ElementType<T, K>` | `T[K]` | Element type |
| `Class<T>` | `(new (...args: any[]) => T)` | Constructor type |
| `Object<K, V>` | `Record<K, V>` | Dictionary |

```js
// Flow
type Status = $Values<StatusEnum>;
type Key = $Keys<Options>;
type Result = $Diff<FullOptions, DefaultOptions>;
type Factory = Class<MyService>;
const data: Object<string, any> = {};
```

```ts
// TypeScript
type Status = StatusEnum[keyof StatusEnum];
type Key = keyof Options;
type Result = Omit<FullOptions, keyof DefaultOptions>;
type Factory = (new (...args: any[]) => MyService);
const data: Record<string, any> = {};
```

#### Compound types

| Flow | TypeScript | Description |
|------|-----------|-------------|
| `opaque type T = U` | `type T = U` | Opaque type |
| `declare type T = U` | `type T = U` | Type declaration |
| `{...}` | `Record<string, any>` | Inexact empty object |
| `{ ...State, ...Getters }` | `State & Getters` | Spread in types → intersection |

```js
// Flow
opaque type ID = number;

declare type UserData = {
  id: number,
  name: string,
};

type UseBlockDiagram = {
  ...State,
  ...UseGetters,
  ...UseHooks,
};
```

```ts
// TypeScript
type ID = number;

type UserData = {
  id: number;
  name: string;
};

type UseBlockDiagram = State & UseGetters & UseHooks;
```

### Classes

Variance modifiers are converted:

| Flow | TypeScript | Description |
|------|-----------|-------------|
| `+property: T` | `readonly property: T` | Covariant property |
| `-property: T` | `property: T` | Contravariant — simply removed |

```js
// Flow
export class Widget
{
  +name: string = '';
  -internal: number = 0;
  static +staticName: string = '';
}
```

```ts
// TypeScript
export class Widget
{
  readonly name: string = '';
  internal: number = 0;
  static readonly staticName: string = '';
}
```

### Functions

#### `%checks` predicates

The `%checks` predicate is removed:

```js
// Flow
function isValid(value: any): boolean %checks
{
  return typeof value === 'string';
}
```

```ts
// TypeScript
function isValid(value: any): boolean
{
  return typeof value === 'string';
}
```

#### Anonymous parameters in function types

Flow allows omitting parameter names in function types. Chef adds names `arg0`, `arg1`, etc.:

```js
// Flow
type Handler = (string, number) => void;
type Callback = any => {};
type StateChanged = ($Values<ProcessState>, string) => void;
```

```ts
// TypeScript
type Handler = (arg0: string, arg1: number) => void;
type Callback = (arg0: any) => {};
type StateChanged = (arg0: ProcessState[keyof ProcessState], arg1: string) => void;
```

#### Optional parameter with default value

TypeScript doesn't allow combining `?` and `= value`. Chef removes the `?`:

```js
// Flow
getSetting(name: string, defaultVal?: any = null) {}
```

```ts
// TypeScript
getSetting(name: string, defaultVal: any = null) {}
```

### Index signatures

Flow's reversed index signature syntax is converted:

```js
// Flow
type Questions = {
  [string: questionId]: QuestionData,
};
```

```ts
// TypeScript
type Questions = {
  [questionId: string]: QuestionData;
};
```

`$Keys<T>` in index position is converted to a mapped type:

```js
// Flow
type Handlers = {
  [$Keys<ProcessCallback>]: (any) => void,
};
```

```ts
// TypeScript
type Handlers = {
  [K in keyof ProcessCallback]: (arg0: any) => void;
};
```

### Array destructuring

Flow allows type annotations in array destructuring. TypeScript does not:

```js
// Flow
const [key: string, value: string = ''] = prop;
```

```ts
// TypeScript
const [key, value = ''] = prop;
```

### for-of / for-in loops

Flow allows typing the loop variable. TypeScript does not:

```js
// Flow
for (const item: string of items) {}
```

```ts
// TypeScript
for (const item of items) {}
```

## Formatting

After conversion, code is automatically formatted with Prettier using these settings:

- **Brace style** — Allman (opening brace on a new line)
- **Indentation** — tabs
- **Quotes** — single
- **Trailing comma** — always
- **Print width** — 120

## Step-by-step migration plan

1. **Initialize TypeScript** (if not done already)
   ```bash
   chef init build
   ```

2. **Run the migration**
   ```bash
   chef flow-to-ts ui.tabs           # single extension
   chef flow-to-ts ui.bbcode.*       # group by pattern
   chef flow-to-ts                   # all in current directory
   ```

3. **Verify the result**
   ```bash
   chef build ui.tabs
   npx tsc --noEmit
   ```

4. **Manual fixes** — some complex patterns may require hand-editing

::: tip
We recommend migrating extensions incrementally — one at a time or in small groups. This simplifies code review and rollback if issues arise.
:::

::: warning Limitations
- Files that can't be parsed as Flow JS (invalid syntax) are left unchanged
- Private methods (`#method`) with Allman brace style may cause a Prettier formatting error — manual fix required
- The conversion doesn't verify type correctness — run `npx tsc --noEmit` after migration
:::
