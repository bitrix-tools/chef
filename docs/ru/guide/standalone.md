# Standalone-сборка

По умолчанию Chef собирает расширение в формате [IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE)-модуля: зависимости от других Bitrix-расширений объявляются как `external` и подключаются через систему зависимостей (`rel` в `config.php`). В standalone-режиме все зависимости инлайнятся прямо в бандл — на выходе получается один самодостаточный файл.

## Когда использовать

- Расширение должно работать без системы зависимостей Bitrix
- Нужен один файл без внешних зависимостей (например, для встраивания на внешние сайты)
- Используются npm-пакеты, которые должны быть включены в бандл

## Настройка

Добавьте `standalone: true` в `bundle.config.js`:

```js
export default {
  input: 'src/index.js',
  output: 'dist/index.bundle.js',
  standalone: true,
};
```

Или в TypeScript:

```ts
// bundle.config.ts
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
  standalone: true,
};
```

## Что происходит при сборке

### Обычный режим (по умолчанию)

```
src/index.ts
├── import { Loc } from 'main.core'      → external (rel в config.php)
├── import { Button } from 'ui.buttons'   → external (rel в config.php)
└── import { parse } from 'linkifyjs'     → требует plugins: { resolve: true }
```

Результат: бандл содержит только код расширения, Bitrix-зависимости загружаются отдельно. npm-пакеты инлайнятся при включённом `plugins: { resolve: true }`.

### Standalone-режим

```
src/index.ts
├── import { Loc } from 'main.core'      → инлайнится в бандл
├── import { Button } from 'ui.buttons'   → инлайнится в бандл
└── import { parse } from 'linkifyjs'     → инлайнится из node_modules
```

Результат: бандл содержит весь код — и расширения Bitrix, и npm-пакеты.

## Пример

```ts
// src/index.ts
import { Loc } from 'main.core';
import { parse } from 'linkifyjs';

export class LinkParser
{
  parse(text: string): string[]
  {
    return parse(text).map(link => link.href);
  }
}
```

Обычная сборка (с `plugins: { resolve: true }`):

```
✔ vendor.link-parser
  └─ link-parser.bundle.js  48.2 KB
  rel: main.core   ← Bitrix-зависимости остаются external
```

Standalone-сборка:

```
✔ vendor.link-parser
  └─ link-parser.bundle.js  48.5 KB
  rel: (пусто — все зависимости внутри)
```

## Сравнение режимов

| | Обычный | Standalone |
|---|---|---|
| Bitrix-расширения | external (`rel`) | инлайнятся |
| npm-пакеты | инлайнятся с `plugins: { resolve: true }` | инлайнятся автоматически |
| Размер бандла | минимальный | максимальный |
| Зависимости в `config.php` | заполняются автоматически | пустые |
| Дублирование кода | нет | возможно |

## Совмещение с другими опциями

Standalone работает со всеми остальными опциями `bundle.config`:

```js
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
  standalone: true,
  namespace: 'BX.MyApp',
  browserslist: true,
};
```

Также совместим с `--production`:

```bash
chef build vendor.my-app --production
```

В этом случае standalone-бандл будет ещё и минифицирован.

## Важно

- **Размер бандла** — в standalone все зависимости попадают в один файл. Если расширение зависит от крупных библиотек (main.core, ui.vue3), размер бандла может значительно вырасти.
- **Дублирование** — если на странице подключены и standalone-бандл, и обычные расширения с общими зависимостями, код зависимостей загрузится дважды.
- **npm-пакеты** — в обычном режиме npm-пакеты резолвятся только при `plugins: { resolve: true }`, при этом Bitrix-зависимости остаются external. В standalone npm-пакеты и Bitrix-зависимости инлайнятся автоматически.
