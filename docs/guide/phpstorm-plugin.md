# Плагин для PhpStorm

Плагин **Bitrix Chef** добавляет в PhpStorm интеграцию с CLI-инструментом `@bitrix/chef`:

- **Запуск unit-тестов** — зелёные стрелки Run/Debug на `describe`/`it` блоках
- **Запуск e2e-тестов** — зелёные стрелки Run на `test()`/`test.describe()` блоках Playwright
- **Отладка unit-тестов** — Debug с breakpoints в исходном TypeScript/JavaScript коде
- **bundle.config** — кастомная иконка для `bundle.config.js`/`bundle.config.ts`
- **Создание расширений** — New → Bitrix Extension

## Требования

- PhpStorm 2025.2+
- `@bitrix/chef` установлен глобально (`npm install -g @bitrix/chef`)

## Установка

### Через Custom Plugin Repository

Плагин не опубликован в JetBrains Marketplace, но можно подключить репозиторий обновлений:

1. Откройте **Settings** → **Plugins**
2. Нажмите ⚙️ → **Manage Plugin Repositories...**
3. Добавьте URL:
   ```
   https://bitrix-tools.github.io/chef/updatePlugins.xml
   ```
4. Найдите **Bitrix Chef** во вкладке **Marketplace** и нажмите **Install**
5. Перезапустите PhpStorm

Обновления будут приходить автоматически.

### Из файла

1. Скачайте ZIP со страницы [Releases](https://github.com/bitrix-tools/chef-phpstorm-plugin/releases)
2. **Settings** → **Plugins** → ⚙️ → **Install Plugin from Disk...**
3. Выберите скачанный ZIP
4. Перезапустите PhpStorm

## Запуск unit-тестов

В файлах `*.test.ts` / `*.test.js` рядом с `describe` и `it` появятся зелёные стрелки:

- **▶ Run** — запуск тестов с выводом результатов в Test Runner
- **🐛 Debug** — запуск с отладкой (breakpoints, step-by-step)

Результаты отображаются в стандартном дереве тестов PhpStorm с поддержкой навигации к коду.

## Запуск e2e-тестов

В файлах `*.spec.ts` / `*.spec.js` рядом с `test()` и `test.describe()` (Playwright API) появятся зелёные стрелки **▶ Run**.

Результаты e2e-тестов также отображаются в дереве тестов PhpStorm.

## Отладка unit-тестов

1. Поставьте breakpoint в исходном файле (`.ts` или `.js`)
2. Нажмите **Debug** (🐛) рядом с тестом
3. Дождитесь остановки на breakpoint

Отладка работает через Chrome DevTools Protocol — плагин подключается к Chromium, который запускает `chef test`.

::: tip
При первом Debug запуск занимает несколько секунд дольше — Chromium стартует и загружает тестовую страницу.
:::

## Создание расширения

**File** → **New** → **Bitrix Extension** — откроет диалог:

- **Extension name** — имя расширения (например, `ui.my-feature`)
- **Language** — TypeScript или JavaScript

Команда `chef create` создаст структуру расширения с конфигом сборки, точкой входа и шаблонами тестов.

## bundle.config

Файлы `bundle.config.js` и `bundle.config.ts` отображаются с иконкой Chef в дереве проекта.
