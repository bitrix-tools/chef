# Flow.js → TypeScript

Команда `chef flow-to-ts` автоматически конвертирует расширения с типизацией [Flow.js](https://flow.org/) в TypeScript. Обрабатывает файлы `.js` внутри расширений — переименовывает в `.ts`, конвертирует синтаксис типов и обновляет `bundle.config`.

## Быстрый старт

```bash
chef flow-to-ts
```

Команда найдёт все расширения в текущей директории и для каждого:

1. Переименует `.js` → `.ts` через `hg rename`
2. Конвертирует синтаксис Flow в TypeScript
3. Обновит `bundle.config.js` → `bundle.config.ts` с новой точкой входа

## Параметры

```bash
chef flow-to-ts [extensions...] [options]
```

| Параметр | Описание |
|----------|----------|
| `extensions` | Имена расширений или glob-паттерны (`main.core`, `ui.bbcode.*`) |
| `-p, --path [path]` | Мигрировать конкретную директорию |
| `--rm-ts` | Удалить существующие `.ts` файлы перед миграцией |
| `--rm-js` | Удалить оригинальные `.js` файлы после миграции |

```bash
chef flow-to-ts                         # Все расширения в текущей директории
chef flow-to-ts ui.tabs ui.buttons      # Конкретные расширения
chef flow-to-ts ui.bbcode.*             # По паттерну
chef flow-to-ts -p ./local/js/ui/tabs   # Конкретная директория
```

::: tip
В zsh экранируйте glob-паттерны, чтобы предотвратить раскрытие оболочкой: `chef flow-to-ts ui.\*`
:::

## Что конвертируется

### Комментарии

Директивы и комментарии Flow заменяются на эквиваленты TypeScript:

```js
// @flow                    →  (удаляется)
// $FlowFixMe              →  // @ts-expect-error
// $FlowIgnore             →  // @ts-ignore
// $FlowExpectError        →  // @ts-expect-error
// $FlowIssue              →  (удаляется)
```

### Импорты

`import typeof` конвертируется в `import type`:

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

### Типы

#### Базовые типы

| Flow | TypeScript | Описание |
|------|-----------|----------|
| `*` | `any` | Экзистенциальный тип |
| `mixed` | `unknown` | Неизвестный тип |
| `?T` | `T \| null \| undefined` | Nullable-тип |
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

#### Утилитарные типы

| Flow | TypeScript | Описание |
|------|-----------|----------|
| `$Exact<T>` | `T` | Точный тип (в TS по умолчанию) |
| `$Shape<T>` | `Partial<T>` | Все поля опциональные |
| `$ReadOnly<T>` | `Readonly<T>` | Все поля readonly |
| `$ReadOnlyArray<T>` | `ReadonlyArray<T>` | Неизменяемый массив |
| `$NonMaybeType<T>` | `NonNullable<T>` | Исключить null/undefined |
| `$Call<F>` | `ReturnType<F>` | Тип возвращаемого значения |
| `$Values<T>` | `T[keyof T]` | Значения объекта как union |
| `$Keys<T>` | `keyof T` | Ключи объекта как union |
| `$Diff<T, U>` | `Omit<T, keyof U>` | Исключить поля U из T |
| `$PropertyType<T, K>` | `T[K]` | Тип свойства |
| `$ElementType<T, K>` | `T[K]` | Тип элемента |
| `Class<T>` | `(new (...args: any[]) => T)` | Тип класса-конструктора |
| `Object<K, V>` | `Record<K, V>` | Словарь |

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

#### Составные типы

| Flow | TypeScript | Описание |
|------|-----------|----------|
| `opaque type T = U` | `type T = U` | Непрозрачный тип |
| `declare type T = U` | `type T = U` | Объявление типа |
| `{...}` | `Record<string, any>` | Неточный пустой объект |
| `{ ...State, ...Getters }` | `State & Getters` | Spread в типах → intersection |

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

### Классы

Модификаторы variance конвертируются:

| Flow | TypeScript | Описание |
|------|-----------|----------|
| `+property: T` | `readonly property: T` | Ковариантное свойство |
| `-property: T` | `property: T` | Контрвариантное — просто удаляется |

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

### Функции

#### Предикаты `%checks`

Предикат `%checks` удаляется:

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

#### Анонимные параметры в типах функций

Flow позволяет не указывать имена параметров в типах функций. Chef добавляет имена `arg0`, `arg1` и т.д.:

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

#### Опциональный параметр с default value

В TypeScript запрещено совмещать `?` и `= value`. Chef убирает `?`:

```js
// Flow
getSetting(name: string, defaultVal?: any = null) {}
```

```ts
// TypeScript
getSetting(name: string, defaultVal: any = null) {}
```

### Index signatures

Flow-синтаксис index signature с перевёрнутым порядком конвертируется:

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

`$Keys<T>` в позиции индекса конвертируется в mapped type:

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

### Деструктуризация массивов

Flow позволяет аннотировать типы в деструктуризации массивов. TypeScript — нет:

```js
// Flow
const [key: string, value: string = ''] = prop;
```

```ts
// TypeScript
const [key, value = ''] = prop;
```

### Циклы for-of / for-in

Flow позволяет типизировать переменную цикла. TypeScript — нет:

```js
// Flow
for (const item: string of items) {}
```

```ts
// TypeScript
for (const item of items) {}
```

## Форматирование

После конвертации код автоматически форматируется через Prettier с настройками:

- **Стиль скобок** — Allman (открывающая скобка на новой строке)
- **Отступы** — табуляция
- **Кавычки** — одинарные
- **Trailing comma** — всегда
- **Print width** — 120

## Пошаговый план миграции

1. **Инициализировать TypeScript** (если ещё не сделано)
   ```bash
   chef init build
   ```

2. **Запустить миграцию**
   ```bash
   chef flow-to-ts ui.tabs           # одно расширение
   chef flow-to-ts ui.bbcode.*       # группа по паттерну
   chef flow-to-ts                   # все в текущей директории
   ```

3. **Проверить результат**
   ```bash
   chef build ui.tabs
   npx tsc --noEmit
   ```

4. **Доработать вручную** — некоторые сложные паттерны могут потребовать ручной правки

::: tip
Рекомендуем мигрировать расширения поэтапно — по одному или по группе. Это упрощает ревью и откат в случае проблем.
:::

::: warning Ограничения
- Файлы, которые не парсятся как Flow JS (невалидный синтаксис), остаются без изменений
- Приватные методы (`#method`) в Allman-стиле могут вызвать ошибку форматирования Prettier — потребуется ручная правка
- Преобразование не проверяет корректность типов — после миграции рекомендуется запустить `npx tsc --noEmit`
:::
