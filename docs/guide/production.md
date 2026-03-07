# Production-режим

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
chef build --production                    # Все расширения в текущей директории
chef build ui.* --production               # По паттерну
chef build ui.buttons main.core --production   # Конкретные расширения
```
