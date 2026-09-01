# Тестирование

Chef запускает тесты в реальном браузере через [Playwright](https://playwright.dev/). Поддерживаются два вида тестов: unit-тесты ([Mocha](https://mochajs.org/) + [Chai](https://www.chaijs.com/)) и E2E-тесты (Playwright Test API). E2E-тесты можно писать как для отдельного расширения, так и на уровне модуля — для [сценариев](/guide/testing-module), в которых участвует сразу несколько расширений.

## Подготовка

Инициализируйте тестовое окружение:

```bash
chef init tests
```

Команда создаёт два файла в корне проекта:

| Файл | Описание |
|------|----------|
| `playwright.config.ts` | Конфиг Playwright для запуска unit и E2E тестов в браузере |
| `.env.test` | Учётные данные для автоматической аутентификации при тестировании |

Заполните учётные данные вашей локальной установки Bitrix:

```env
BASE_URL=http://localhost
LOGIN=admin
PASSWORD=your_password
```

| Переменная | Описание |
|------------|----------|
| `BASE_URL` | URL локальной установки Bitrix |
| `LOGIN` | Логин тестового пользователя |
| `PASSWORD` | Пароль тестового пользователя |

::: warning
Не коммитьте `.env.test` в систему контроля версий — файл содержит конфиденциальные данные.
:::

Установите браузеры Playwright:

```bash
npx playwright install
```

### Типы для IDE

`mocha`, `chai` и их типы включены в Chef и используются при запуске `chef test`. Для работы автодополнения в IDE установите типы локально:

```bash
npm install --save-dev @types/mocha @types/chai @playwright/test
```

## Запуск тестов

```bash
# Все тесты расширения
chef test vendor.my-extension

# Только unit-тесты
chef test unit vendor.my-extension

# Только e2e-тесты
chef test e2e vendor.my-extension

# Сценарные тесты уровня модуля (несколько расширений)
chef test module crm

# Конкретный файл
chef test unit vendor.my-extension ./utils.test.ts

# Тесты по паттерну
chef test vendor.* --grep "should render"

# Список тестов без прогона
chef test vendor.my-extension --list

# Watch-режим — перезапуск при изменениях
chef test vendor.my-extension -w
```

### Живой вывод

Во время прогона chef показывает единый статус-бар по браузерам — от старта до финала в одном виде. Пока движок разогревается, у него видна стадия; как только пошли тесты — счётчик, и какой тест сейчас выполняется:

```
○ Chromium starting  ·  ○ Firefox  ·  ○ WebKit · 0.7s
○ Chromium 12/132  ·  ○ Firefox preparing  ·  ○ WebKit 8/132 · 5.3s
✓ Chromium 132/132  ·  ○ Firefox 90/132  ·  ○ WebKit building · 12.1s
```

Результаты сгруппированы по describe-блокам: путь suite печатается заголовком один раз, тесты — под ним с отступом. Тест, прошедший в нескольких браузерах, — одна строка с тегом всех движков (`◌` — ещё выполняется):

```
   ui.notification > Position
     ✓ has TOP_LEFT     [Chromium ✓ · Firefox ✓ · WebKit ◌]
     ✗ has BOTTOM_RIGHT  [Chromium ✗ · Firefox ✓ · WebKit ✓]
```

Тесты, прошедшие только после повторной попытки (retry в Playwright), помечаются как flaky:

```
     ✓ opens the dialog  (passed on attempt 2)   [Chromium ✓]
```

А в итоговой сводке flaky-тесты выносятся отдельной цифрой (`Tests  130 passed · 2 flaky`).

### Отладка

```bash
# Открыть браузер с DevTools
chef test vendor.my-extension --debug

# С видимым окном браузера
chef test vendor.my-extension --headed

# В конкретном браузере
chef test vendor.my-extension --project chromium
```

В режиме `--debug` включаются source maps и открываются DevTools — можно ставить breakpoints прямо в исходном TypeScript-коде.

### Листинг без прогона

`--list` перечисляет тесты, которые были бы запущены, но не запускает их — удобно, чтобы быстро увидеть состав набора или подобрать паттерн для `--grep`:

```bash
chef test vendor.my-extension --list
```

Тесты сгруппированы по describe-блокам, отложенные (`skip`/`fixme`) помечены. В конце — сводка `Summary` с разбивкой по видам: отдельно unit, отдельно e2e (для модуля — только e2e), с числом тестов и сколько из них запускается / отложено:

```
  Summary
  Unit  132 tests · 132 runnable
  E2E   25 tests · 25 runnable
```

Работает для расширений (unit + e2e), модулей (`chef test module`) и всех репортеров (`--reporter default|json|teamcity`). С `--watch` несовместимо.

### Аргументы Playwright

У chef свои опции, и он намеренно не повторяет весь CLI Playwright. Всё, что chef не считает своим, уходит раннеру как есть:

```bash
# Обновить эталонные снимки
chef test e2e vendor.my-extension --update-snapshots

# Прогнать тест несколько раз подряд (ловля флейков)
chef test e2e vendor.my-extension --repeat-each=3 --workers=1

# Собрать trace для разбора упавшего теста
chef test e2e vendor.my-extension --trace=on
```

Ходовые опции перечислены в `chef test e2e --help`, но список там не полный: любая опция Playwright работает, даже добавленная в свежей версии раннера — обновлять chef для этого не нужно.

Работает для e2e — у unit-тестов нет отдельного процесса раннера, им передавать опции некуда, и chef скажет об этом явно.

За chef остаются опции, которые управляют им самим: `--watch`, `--path`, `--console`, `--list`, `--reporter`, `--cdp-port`, а также `--headed`, `--debug`, `--grep` и `--project` — их chef переводит в аргументы Playwright сам. Всё прочее — Playwright.

Опечатку в имени опции поймает раннер, обычно с подсказкой:

```
error: unknown option '--headles'
(Did you mean --headed?)
```

Аргументы дописываются последними, поэтому при совпадении побеждают они, а не то, что подставил chef.

### Прямой вызов Playwright

Если понадобилось запустить Playwright руками, минуя chef, берите **проектный** бинарник:

```bash
./node_modules/.bin/playwright test <spec>
```

Бинарник из поставки chef для этого не годится: `@playwright/test` загрузится дважды — из дерева chef и из дерева проекта — и запуск упадёт с ошибкой:

```
Playwright Test did not expect test.describe() to be called here
You have two different versions of @playwright/test
```

Сам `chef test` в эту ловушку не попадает — он всегда запускает раннер из корня проекта. Если версии Playwright в проекте и в поставке chef разошлись, перед e2e-прогоном появится предупреждение с обеими версиями и напоминанием про проектный бинарник.

## Массовый запуск

`chef test` без аргументов или с glob-паттерном (`im.v2.**`) проходит по всем подходящим расширениям. Расширения без тестов пропускаются молча — в выводе появляются только те, у которых есть тесты или какие-то проблемы.

Браузерный консольный вывод по умолчанию скрыт, чтобы не замусоривать массовый отчёт. Если нужно — добавь `--console`:

```bash
chef test im.v2.** --console
```

### Статусы задач

Рядом с расширением chef показывает причину неудачи прямо в строке задачи:

| Статус | Что значит |
|--------|------------|
| `✓ Unit tests` | Все тесты прошли |
| `✗ Unit tests (3 failed)` | Часть тестов упала, число — сколько |
| `✗ Unit tests (build failed)` | Не собрался тестовый бандл (Rollup) |
| `✗ Unit tests (crashed before any tests ran)` | Упало до первого `it` — обычно ошибка в setup |
| `⚠ Unit tests (no tests collected)` | Файлы есть, но Mocha не нашёл `it` (пустой `describe`, `.skip`) |
| `— Unit tests (no test files)` | В директории `test/unit/` (или `test/`) нет `*.test.{ts,js}` |
| `— E2E tests (no test files)` | То же для e2e |

Расширение или модуль, у которого нет тестов, помечается как `skipped` (не `passed`) — в сводке отдельной цифрой.

### Сводка в конце

После прогона chef печатает агрегированный отчёт:

- **Failed Tests (N)** — все упавшие тесты со стек-трейсами и code frame, сгруппированные по расширениям. Для e2e рядом печатаются пути к артефактам Playwright (screenshot, video, trace), сгруппированные по браузеру, — можно сразу открыть в редакторе.
- **Errors (N)** — ошибки сборки и runtime-крэши, по одной строке на причину.
- **Issues** — список расширений с количеством ошибок/предупреждений.
- **Extensions / Tests / Time** — общие цифры: сколько расширений и тестов прошло, упало или было пропущено, сколько заняло. В строке **Tests** отдельной цифрой отмечаются flaky-тесты (прошли после ретрая). Для `chef test module` строка называется **Modules**.

## Советы

### Изоляция тестов

Каждый тест должен быть независимым. Используйте `beforeEach`/`afterEach` для настройки и очистки:

```ts
describe('TodoList', () => {
  let list: TodoList;

  beforeEach(() => {
    list = new TodoList();
  });

  afterEach(() => {
    list.destroy();
  });

  it('should add item', () => {
    list.add('Buy milk');
    assert.equal(list.getCount(), 1);
  });

  it('should start empty', () => {
    assert.equal(list.getCount(), 0);
  });
});
```

### Организация тестов

Группируйте тесты по функциональности:

```ts
describe('UserService', () => {
  describe('create', () => {
    it('should create user with valid data', () => { /* ... */ });
    it('should throw on duplicate email', () => { /* ... */ });
  });

  describe('update', () => {
    it('should update user name', () => { /* ... */ });
    it('should not allow empty name', () => { /* ... */ });
  });

  describe('delete', () => {
    it('should soft delete user', () => { /* ... */ });
  });
});
```
