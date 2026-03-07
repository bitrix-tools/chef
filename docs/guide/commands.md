# Команды

## chef build

Сборка расширений с помощью Rollup, Babel и PostCSS.

```bash
chef build [extensions...] [options]
```

| Параметр | Описание |
|----------|----------|
| `extensions` | Имена расширений или glob-паттерны (`main.core`, `ui.bbcode.*`) |
| `-w, --watch` | Отслеживать изменения и пересобирать |
| `-p, --path [path]` | Собрать конкретную директорию |
| `-v, --verbose` | Подробный вывод сборки |
| `-f, --force` | Пропустить проверки и принудительно пересобрать |
| `--production` | Production-режим (минификация, без source maps) |

```bash
chef build main.core ui.buttons    # Собрать конкретные расширения
chef build main.core -w            # Собрать и отслеживать изменения
chef build ui.bbcode.*             # Собрать расширения по паттерну
chef build                         # Собрать всё в текущей директории
chef build ui.buttons --production # Production-сборка
```

::: tip
В zsh экранируйте glob-паттерны, чтобы предотвратить раскрытие оболочкой: `chef build ui.\*`
:::

## chef test

Запуск unit и E2E тестов через Playwright.

```bash
chef test [extensions...] [options]        # unit + e2e
chef test unit [extensions...] [file?]     # только unit
chef test e2e [extensions...] [file?]      # только e2e
```

| Параметр | Описание |
|----------|----------|
| `extensions` | Имена расширений или glob-паттерны |
| `file` | Только для `unit`/`e2e` — имя файла с тестами (`dom.test.ts`) |
| `-w, --watch` | Отслеживать изменения и перезапускать тесты |
| `-p, --path [path]` | Тестировать конкретную директорию |
| `--headed` | Запускать с видимым окном браузера |
| `--debug` | Открыть браузер с DevTools и sourcemaps |
| `--grep <pattern>` | Запускать только тесты, соответствующие паттерну |
| `--project <names>` | Запускать в конкретных браузерах (chromium, firefox, webkit) |

```bash
chef test main.core ui.buttons                    # Все тесты
chef test unit main.core                          # Только unit
chef test unit main.core ./render-tag.test.ts     # Конкретный файл
chef test e2e ui.buttons                          # Только e2e
chef test ui.* --headed                           # С видимым браузером
chef test main.core -w                            # Watch-режим
chef test main.core --debug                       # Отладка с DevTools
chef test --grep "should render"                  # Фильтрация по имени
chef test main.core --project chromium firefox    # Конкретные браузеры
```

## chef stat

Анализ размера бандла и дерева зависимостей расширений.

```bash
chef stat [extensions...] [options]
```

| Параметр | Описание |
|----------|----------|
| `extensions` | Имена расширений или glob-паттерны |
| `-p, --path [path]` | Анализировать конкретную директорию |

```bash
chef stat main.core ui.buttons     # Анализ конкретных расширений
chef stat ui.*                     # Анализ группы
```

## chef create

Создание нового расширения Bitrix со стандартной структурой файлов.

```bash
chef create <name> [options]
```

| Параметр | Описание |
|----------|----------|
| `name` | Имя расширения (`my.extension`) |
| `-p, --path [path]` | Создать в указанной директории |
| `-t, --tech [tech]` | Технология: `ts` (по умолчанию) или `js` |
| `-f, --force` | Перезаписать без подтверждения |

```bash
chef create my.extension                          # TypeScript-расширение
chef create my.extension --tech js                # JavaScript-расширение
chef create my.extension -p ./local/js/vendor     # В конкретной директории
```

Сгенерированные файлы:

```
my.extension/
├── bundle.config.ts
├── config.php
└── src/
    └── my.extension.ts
```

## chef init

Инициализация окружения сборки и тестирования.

### chef init build

Инициализация TypeScript, алиасов путей и browserslist.

```bash
chef init build [options]
```

| Параметр | Описание |
|----------|----------|
| `-p, --path [path]` | Инициализировать в указанной директории |

Команда:
1. Сканирует все расширения в проекте
2. Генерирует `aliases.tsconfig.json` с алиасами путей для каждого расширения
3. Создаёт `tsconfig.json` с рекомендованными настройками
4. Создаёт `.browserslistrc` с рекомендованными целевыми браузерами

Подробнее — в разделе [TypeScript](/guide/typescript).

### chef init tests

Инициализация тестового окружения Playwright.

```bash
chef init tests [options]
```

| Параметр | Описание |
|----------|----------|
| `-p, --path [path]` | Инициализировать в указанной директории |

Создаёт `playwright.config.ts` и `.env.test` в корне проекта.

Подробнее — в разделе [Тестирование](/guide/testing).

## chef flow-to-ts

Миграция кода с типизацией Flow.js в TypeScript.

```bash
chef flow-to-ts [options]
```

| Параметр | Описание |
|----------|----------|
| `-p, --path [path]` | Мигрировать конкретную директорию |
| `--rm-ts` | Удалить существующие `.ts` файлы после миграции |
| `--rm-js` | Удалить оригинальные `.js` файлы после миграции |

Что делает:
- Удаляет аннотации типов Flow
- Переименовывает `.js` файлы в `.ts`
- Конвертирует синтаксис Flow в эквиваленты TypeScript
