# chef test

Запуск unit и E2E тестов через Playwright.

```bash
chef test [extensions...] [options]        # unit + e2e
chef test unit [extensions...] [file?]     # только unit
chef test e2e [extensions...] [file?]      # только e2e
```

## Подкоманды

| Подкоманда | Описание |
|------------|----------|
| `chef test` | Запустить unit и e2e тесты |
| `chef test unit` | Запустить только unit-тесты |
| `chef test e2e` | Запустить только e2e-тесты |

## Аргументы

| Аргумент | Описание |
|----------|----------|
| `extensions` | Имена расширений или glob-паттерны (например `main.core`, `ui.bbcode.*`) |
| `file` | Только для `unit`/`e2e` — имя файла с тестами (например `dom.test.ts`) |

## Параметры

| Параметр | Описание |
|----------|----------|
| `-w, --watch` | Отслеживать изменения и перезапускать тесты |
| `-p, --path [path]` | Тестировать конкретную директорию |
| `--headed` | Запускать браузерные тесты с видимым окном |
| `--debug` | Открыть браузер с DevTools и sourcemaps для отладки |
| `--grep <pattern>` | Запускать только тесты, соответствующие паттерну |
| `--project <names>` | Запускать тесты в конкретных браузерах (chromium, firefox, webkit) |

## Примеры

```bash
# Запуск всех тестов
chef test main.core ui.buttons

# Только unit-тесты
chef test unit main.core
chef test unit main.core ./render-tag.test.ts        # Конкретный файл

# Только e2e-тесты
chef test e2e ui.buttons
chef test e2e ui.buttons ./render-buttons.spec.ts    # Конкретный файл

# Опции
chef test ui.* --headed                         # С видимым браузером
chef test main.core -w                          # Watch-режим
chef test main.core --debug                     # Отладка с DevTools и sourcemaps
chef test --grep "should render"                # Фильтрация по имени теста
chef test main.core --project chromium firefox  # Запуск в конкретных браузерах
```

## См. также

- [Настройка тестов](/ru/guide/test-setup) — как инициализировать тестовое окружение
