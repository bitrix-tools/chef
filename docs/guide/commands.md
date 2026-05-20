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
chef build ui.bbcode.*             # Собрать прямые дочерние расширения
chef build im.v2.**                # Собрать все вложенные расширения
chef build                         # Собрать всё в текущей директории
chef build ui.buttons --production # Production-сборка
```

### Glob-паттерны

| Паттерн | Описание | Пример |
|---------|----------|--------|
| `*` | Один уровень вложенности | `ui.bbcode.*` → `ui.bbcode.parser`, `ui.bbcode.model` |
| `**` | Все уровни вложенности | `im.v2.**` → `im.v2.const`, `im.v2.provider.service.settings` |

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
| `--console` | Печатать консольный вывод браузера (по умолчанию скрыт) |

```bash
chef test main.core ui.buttons                    # Все тесты
chef test unit main.core                          # Только unit
chef test unit main.core ./render-tag.test.ts     # Конкретный файл
chef test e2e ui.buttons                          # Только e2e
chef test ui.* --headed                           # Прямые дочерние, с видимым браузером
chef test im.v2.**                                # Все вложенные расширения
chef test main.core -w                            # Watch-режим
chef test main.core --debug                       # Отладка с DevTools
chef test --grep "should render"                  # Фильтрация по имени
chef test main.core --project chromium firefox    # Конкретные браузеры
chef test main.core --console                     # С консольным выводом браузера
```

## chef typecheck

Проверка типов TypeScript в расширениях.

```bash
chef typecheck [extensions...] [options]
```

| Параметр | Описание |
|----------|----------|
| `extensions` | Имена расширений или glob-паттерны |
| `-p, --path [path]` | Искать расширения, начиная с указанной директории |
| `--file <patterns...>` | Проверить конкретные файлы (пути относительно директории расширения) |
| `--exclude <patterns...>` | Исключить файлы из проверки (пути или glob-паттерны относительно директории расширения) |

```bash
chef typecheck main.core                           # Проверить конкретное расширение
chef typecheck ui.bbcode.*                         # Проверить группу расширений
chef typecheck main.core --file src/lib/dom.ts     # Проверить конкретный файл
chef typecheck main.core --exclude 'src/legacy/**' # Исключить файлы из проверки
chef typecheck                                     # Проверить всё в текущей директории
```

::: tip
При сборке (`chef build`) типы проверяются автоматически. Команда `chef typecheck` полезна, когда нужно проверить типы без полной сборки.
:::

## chef lint

Линтинг расширений через ESLint.

```bash
chef lint [extensions...] [options]
```

| Параметр | Описание |
|----------|----------|
| `extensions` | Имена расширений или glob-паттерны |
| `-p, --path [path]` | Искать и линтить расширения, начиная с указанной директории |
| `--fix` | Автоматически исправлять проблемы |
| `--file <patterns...>` | Линтить конкретные файлы (glob-паттерны относительно `src/`) |
| `--exclude <patterns...>` | Исключить файлы из линтинга (glob-паттерны относительно директории расширения) |
| `--no-cache` | Отключить кеширование (по умолчанию кеш включён) |

```bash
chef lint main.core                        # Линтинг конкретного расширения
chef lint ui.*                             # Линтинг группы расширений
chef lint main.core --fix                  # Автоматическое исправление
chef lint main.core --file "*.ts"          # Линтить только .ts файлы
chef lint main.core --exclude 'src/old/**' # Исключить файлы из линтинга
```

::: tip
Для работы `chef lint` необходим файл `eslint.config.{js,mjs,cjs,ts,mts,cts}` в проекте. Если конфиг не найден, линтинг пропускается.
:::

## chef diag

Диагностика и анализ расширений по всему проекту.

```bash
chef diag <subcommand> [options]
```

### Подкоманды

| Подкоманда | Описание |
|------------|----------|
| `top-used` | Самые востребованные расширения (по числу зависимых) |
| `top-deps` | Расширения с наибольшим числом прямых зависимостей |
| `top-deps-tree` | Расширения с наибольшим деревом транзитивных зависимостей |
| `top-bundle-size` | Расширения с самыми тяжёлыми бандлами (JS + CSS + ассеты) |
| `top-total-size` | Расширения с наибольшим суммарным размером (свой код + зависимости) |
| `deps-tree` | Дерево зависимостей расширения |
| `bundle-size` | Размер бандла расширения (JS + CSS + ассеты) |
| `config` | Поиск расширений по параметрам `bundle.config` |
| `unused-deps` | Расширения с неиспользуемыми зависимостями |
| `circular-deps` | Проверка на циклические зависимости |
| `circular-imports` | Проверка на циклические импорты между файлами |
| `find-usages` | Поиск использований JS-кода расширения (импорты, namespace, наследование) |
| `find-loaders` | Поиск PHP-подключений расширения (`Extension::load`, `CJSCore::Init`, `config.php rel`) |
| `unused` | Расширения, на которые никто не ссылается |
| `re-exports` | Расширения, которые ре-экспортируют символы из других расширений |
| `baseline` | Проверка использования веб-фич, не поддерживаемых целевыми браузерами |

### Общие параметры

| Параметр | Описание |
|----------|----------|
| `-p, --path [path]` | Сканировать расширения, начиная с указанной директории |
| `-l, --limit <n>` | Ограничить количество результатов (по умолчанию: 20) |
| `-i, --include <patterns>` | Показать только расширения, соответствующие glob-паттерну |
| `-x, --exclude <patterns>` | Исключить расширения по glob-паттерну |
| `--sort <column>` | Сортировка по колонке (для `top-bundle-size` и `top-total-size`) |

Паттерны поддерживают `*`, `**`, `?`, `[abc]` и другие glob-конструкции. Несколько паттернов через запятую или повторением опции:

```bash
--include 'ui.*'                # Только расширения ui.*
--exclude 'main.*,im.*'        # Все, кроме main.* и im.*
--include 'ui.*' -x 'ui.vue.*' # ui.*, но без ui.vue.*
```

### Примеры

```bash
chef diag top-used                             # Самые востребованные расширения
chef diag top-bundle-size --limit 10           # TOP 10 тяжёлых бандлов
chef diag top-bundle-size --sort js            # Сортировка по размеру JS
chef diag top-total-size --sort own            # Сортировка по собственному размеру
chef diag top-used --exclude 'main.*,im.*'     # Исключить main и im из результатов
chef diag deps-tree im.v2.application.core     # Дерево зависимостей расширения
chef diag deps-tree main.core --depth 2        # Ограничить глубину дерева
chef diag deps-tree main.core --why ui.vue3    # Найти путь до конкретной зависимости
chef diag bundle-size ui.buttons               # Размер бандла расширения
chef diag bundle-size crm.timeline --with-deps # С размером всех зависимостей
chef diag circular-deps                        # Все циклические зависимости
chef diag circular-deps main.core              # Проверить конкретное расширение
chef diag unused-deps                          # Неиспользуемые зависимости
chef diag find-usages ui.buttons               # Сводка использований ui.buttons (JS)
chef diag find-usages ui.notification --list   # Полный список локаций
chef diag find-usages ui.notification --imports UI                       # Только файлы с import { UI }
chef diag find-usages ui.notification --namespace BX.UI.Notification.Center
chef diag find-usages ui.notification --kind extends                     # Только наследники
chef diag find-loaders ui.notification         # Где extension подключают из PHP
chef diag config --key namespace               # Расширения с namespace в конфиге
chef diag config --key minification --missing  # Расширения без минификации
chef diag config --key input --except          # Расширения с параметрами кроме input
chef diag unused                               # Неиспользуемые расширения
chef diag re-exports                           # Ре-экспорты символов из других расширений
chef diag re-exports 'calendar.*'              # Только в calendar.*
chef diag re-exports 'im.v2.**' ui.text-editor # Несколько паттернов сразу
chef diag baseline                             # Обзор несовместимых фич по всем расширениям
chef diag baseline ui.buttons                  # Проверить конкретное расширение
```

## chef aliases

Регенерация алиасов путей для TypeScript (`aliases.tsconfig.json`).

```bash
chef aliases [options]
```

| Параметр | Описание |
|----------|----------|
| `-p, --path [path]` | Корень проекта для сканирования расширений |
| `-q, --quiet` | Тихий режим — однострочный вывод без цветов |

```bash
chef aliases                       # Перегенерировать алиасы
chef aliases -q                    # Тихий режим (для скриптов и хуков)
```

Обычно запускается автоматически через VCS-хуки (см. `chef init hooks`).

## chef create

Создание нового расширения Bitrix со стандартной структурой файлов.

```bash
chef create <name> [options]
```

| Параметр | Описание |
|----------|----------|
| `name` | Имя расширения (`my.extension`) |
| `-p, --path [path]` | Создать в указанной директории |
| `-t, --tech [tech]` | Технология: `ts` или `js`. По умолчанию определяется автоматически по окружению |
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

### chef init hooks

Установка VCS-хуков для автоматического обновления алиасов путей.

```bash
chef init hooks [options]
```

| Параметр | Описание |
|----------|----------|
| `-p, --path [path]` | Корень проекта, где будут установлены хуки |

Поддерживает Git и Mercurial. Хуки запускают `chef aliases --quiet` после pull, merge, checkout и rebase, чтобы `aliases.tsconfig.json` всегда оставался актуальным.

## chef baseline

Проверка доступности веб-фич для текущих browser targets проекта.

```bash
chef baseline [query] [options]
```

| Параметр | Описание |
|----------|----------|
| `query` | ID фичи или поисковый запрос (`subgrid`, `"private fields"`, `Promise.any`) |
| `--list` | Вывести все поддерживаемые и транспилируемые фичи |
| `-p, --path [path]` | Путь к проекту (для чтения `.browserslistrc`) |

Без аргументов или с `--list` выводит полный список доступных фич, сгруппированный по категориям (JavaScript, CSS, API, HTML).

### Поиск фич

Поиск работает по ID, названию, описанию и MDN-идентификаторам (`compat_features`). Запросы автоматически нормализуются — пробелы конвертируются в дефисы для сопоставления с ID.

```bash
chef baseline subgrid                 # Поиск по ID
chef baseline "private fields"        # Поиск по compat_features
chef baseline "container queries"     # Поиск CSS-фичи
chef baseline "Promise.any"           # Поиск JS API
```

### Статусы

В результатах отображается статус относительно текущих targets:

- `✓ supported` — нативно поддерживается всеми целевыми браузерами
- `~ transpiled` — JS-синтаксис, транспилируется Babel
- `✗ unsupported` — не поддерживается, требуется полифил или фолбэк

Для фич, транспилируемых Babel, отображается детализация по каждому трансформу — какие работают нативно, какие будут транспилированы.

### Примеры

```bash
chef baseline                         # Все доступные фичи (supported + transpiled)
chef baseline class-syntax            # Детали фичи с Babel-трансформами
chef baseline "arrow functions"       # Поиск по описанию
chef baseline --list                  # Полный список по категориям
```

## chef flow-to-ts

Миграция кода с типизацией Flow.js в TypeScript.

```bash
chef flow-to-ts [extensions...] [options]
```

| Параметр | Описание |
|----------|----------|
| `extensions` | Имена расширений или glob-паттерны (`main.core`, `ui.bbcode.*`) |
| `-p, --path [path]` | Мигрировать конкретную директорию |
| `--rm-ts` | Удалить существующие `.ts` файлы после миграции |
| `--rm-js` | Удалить оригинальные `.js` файлы после миграции |

Что делает:
- Переименовывает `.js` файлы в `.ts` через `hg rename`
- Конвертирует синтаксис Flow в эквиваленты TypeScript
- Обновляет `bundle.config.js` → `bundle.config.ts`

Подробнее — в разделе [Flow.js → TypeScript](/guide/flow-to-ts).
