# chef test

Запуск unit и E2E тестов через Playwright.

```bash
chef test [extensions...] [options]
```

## Аргументы

| Аргумент | Описание |
|----------|----------|
| `extensions` | Имена расширений или glob-паттерны (например `main.core`, `ui.bbcode.*`) |

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
chef test main.core ui.buttons                  # Тестировать конкретные расширения
chef test ui.* --headed                         # Тестировать с видимым браузером
chef test main.core -w                          # Тестировать с отслеживанием изменений
chef test main.core --debug                     # Отладка с DevTools и sourcemaps
chef test --grep "should render"                # Фильтрация по имени теста
chef test main.core --project chromium firefox  # Запуск в конкретных браузерах
```

## См. также

- [Настройка тестов](/ru/guide/test-setup) — как инициализировать тестовое окружение
