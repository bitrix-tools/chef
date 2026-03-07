# Production-сборка

По умолчанию Chef собирает расширения в dev-режиме. Для production-сборки используйте флаг `--production`:

```bash
chef build ui.buttons --production
```

## Сравнение режимов

| | Dev (по умолчанию) | Production |
|---|---|---|
| Source maps | включены | отключены |
| Минификация | отключена | включена (Terser) |
| Vue `__file` | добавляется | удаляется |
| `process.env.NODE_ENV` | `"development"` | `"production"` |

## Dev-режим

Режим по умолчанию при запуске `chef build`. Оптимизирован для разработки:

- **Source maps** — карты исходников генерируются рядом с бандлом (`.bundle.js.map`). Позволяют отлаживать TypeScript-код прямо в DevTools браузера.
- **Без минификации** — код остаётся читаемым, ошибки легко локализовать.
- **Vue `__file`** — в Vue-компонентах добавляется путь к исходнику, что помогает Vue Devtools показывать имена компонентов.

```bash
chef build ui.buttons          # dev-режим
chef build ui.buttons -w       # dev + watch
```

## Production-режим

Оптимизирован для деплоя:

- **Минификация** — код сжимается через [Terser](https://terser.org/). Удаляются пробелы, сокращаются имена переменных, удаляется мёртвый код.
- **Без source maps** — карты исходников не генерируются, уменьшается объём файлов.
- **Без Vue `__file`** — в Vue-компонентах удаляется путь к исходнику, не раскрывается структура проекта.

```bash
chef build ui.buttons --production
```

### Пример

Dev-сборка:

```
✔ ui.buttons
  └─ buttons.bundle.js  13.7 KB
```

Production-сборка:

```
✔ ui.buttons
  └─ buttons.bundle.js  5.9 KB (-7.8 KB)
```

## Переменные окружения

Chef автоматически заменяет переменные окружения при сборке, аналогично [Vite](https://vite.dev/guide/env-and-mode):

| Переменная | Production | Development |
|---|---|---|
| `process.env.NODE_ENV` | `"production"` | `"development"` |
| `import.meta.env.MODE` | `"production"` | `"development"` |
| `import.meta.env.PROD` | `true` | `false` |
| `import.meta.env.DEV` | `false` | `true` |

Замена происходит статически на этапе сборки. Это позволяет tree-shaking вырезать dev-only код из npm-пакетов (Lexical, React, Vue и др.):

```ts
// Этот блок будет полностью удалён в production-сборке
if (process.env.NODE_ENV !== 'production') {
  console.warn('Debug info');
}
```

## Приоритет настроек

Если `sourceMaps` или `minification` явно заданы в `bundle.config` — значение из конфига имеет приоритет над режимом сборки.

```ts
// bundle.config.ts
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
  sourceMaps: true,  // source maps будут ВСЕГДА, даже в --production
};
```

| Настройка | Не задана в конфиге | Задана в конфиге |
|---|---|---|
| `sourceMaps` | dev: `true`, prod: `false` | Значение из конфига |
| `minification` | dev: `false`, prod: `true` | Значение из конфига |

## Массовая production-сборка

Флаг `--production` работает со всеми способами указания расширений:

```bash
chef build --production                        # Всё в текущей директории
chef build ui.* --production                   # По паттерну
chef build ui.buttons main.core --production   # Конкретные расширения
```

## Standalone-сборка

По умолчанию Chef собирает расширение в формате [IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE)-модуля: зависимости от других Bitrix-расширений объявляются как `external` и подключаются через систему зависимостей (`rel` в `config.php`). В standalone-режиме все зависимости инлайнятся прямо в бандл — на выходе получается один самодостаточный файл.

### Когда использовать

- Расширение должно работать без системы зависимостей Bitrix
- Нужен один файл без внешних зависимостей (для встраивания на внешние сайты)
- Используются npm-пакеты, которые должны быть включены в бандл

### Настройка

Добавьте `standalone: true` в `bundle.config.ts`:

```ts
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
  standalone: true,
};
```

### Что происходит при сборке

**Обычный режим (по умолчанию):**

```
src/index.ts
├── import { Loc } from 'main.core'      → external (rel в config.php)
├── import { Button } from 'ui.buttons'   → external (rel в config.php)
└── import { parse } from 'linkifyjs'     → требует resolveNodeModules: true
```

Результат: бандл содержит только код расширения, Bitrix-зависимости загружаются отдельно. npm-пакеты инлайнятся при включённом `resolveNodeModules: true`.

**Standalone-режим:**

```
src/index.ts
├── import { Loc } from 'main.core'      → инлайнится в бандл
├── import { Button } from 'ui.buttons'   → инлайнится в бандл
└── import { parse } from 'linkifyjs'     → инлайнится из node_modules
```

Результат: бандл содержит весь код — и расширения Bitrix, и npm-пакеты.

### Пример

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

Обычная сборка (с `resolveNodeModules: true`):

```
✔ vendor.link-parser
  └─ link-parser.bundle.js  48.2 KB
  rel: main.core   ← Bitrix-зависимости остаются external
```

Standalone-сборка:

```
✔ vendor.link-parser
  └─ link-parser.bundle.js  93.7 KB
  rel: (пусто — все зависимости внутри)
```

::: info
Размер бандла в standalone заметно больше — в него входят все Bitrix-зависимости (main.core и др.), которые в обычном режиме загружаются отдельно.
:::

### Сравнение режимов

| | Обычный | Standalone |
|---|---|---|
| Bitrix-расширения | external (`rel`) | инлайнятся |
| npm-пакеты | инлайнятся с `resolveNodeModules: true` | инлайнятся автоматически |
| Размер бандла | минимальный | максимальный |
| Зависимости в `config.php` | заполняются автоматически | пустые |
| Дублирование кода | нет | возможно |

### Совмещение с другими опциями

Standalone работает со всеми остальными опциями `bundle.config`:

```ts
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
  standalone: true,
  namespace: 'BX.MyApp',
};
```

Также совместим с `--production`:

```bash
chef build vendor.my-app --production
```

В этом случае standalone-бандл будет ещё и минифицирован.

### Важно

- **Размер бандла** — в standalone все зависимости попадают в один файл. Если расширение зависит от крупных библиотек (main.core, ui.vue3), размер бандла может значительно вырасти.
- **Дублирование** — если на странице подключены и standalone-бандл, и обычные расширения с общими зависимостями, код зависимостей загрузится дважды.
- **npm-пакеты** — в обычном режиме npm-пакеты резолвятся только при `resolveNodeModules: true`, при этом Bitrix-зависимости остаются external. В standalone npm-пакеты и Bitrix-зависимости инлайнятся автоматически.
