# Переход на Chef

## Быстрый старт

```bash
# 1. Обновить репозиторий
hg pull && hg update

# 2. Чистая установка зависимостей (Chef установится автоматически)
rm -rf node_modules && npm install

# 3. Проверить, что Chef установился
chef --version

# 4. Сгенерировать алиасы расширений для TypeScript
chef aliases
```

Попробуйте собрать расширение, с которым вы работаете:

```bash
chef build ui.buttons
```

После первой сборки через Chef вы увидите diff в собранных файлах. Это нормально — достаточно один раз пересобрать и закоммитить. Chef собирает бандлы немного иначе, чем `@bitrix/cli`.

::: warning @bitrix/cli больше не работает
Сборка через `@bitrix/cli` (`bitrix build`) больше не работает — он не понимает новый формат `.browserslistrc`. Используйте `@bitrix/chef`.
:::

::: tip Если у вас ветка, созданная до перехода
После мерджа `default` в вашу ветку выполните `rm -rf node_modules && npm install` и `chef aliases`.
:::

## Что меняется

Изменения затрагивают две области:

### Инструменты

- **@bitrix/chef** вместо `@bitrix/cli` — новый сборщик
- **ESLint 9** вместо ESLint 8 — flat config (`eslint.config.js` вместо `.eslintrc.js`)
- **Минимальные версии браузеров подняты** — вместо `IE >= 11` теперь поддержка по [`baseline widely available`](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility)

### Разработка и тестирование

- **TypeScript** — новые расширения пишем на `.ts`, старые можно перевести по желанию (`chef flow-to-ts`)
- **Unit-тесты в браузерах** — вместо JSDom тесты теперь запускаются в реальных браузерах, в контексте продукта на вашей локальной установке, через Playwright (Chromium, Firefox, WebKit)
- **E2E-тесты** — появилась возможность писать end-to-end тесты на реальной локальной установке


## Подробнее о шагах

### npm install

`npm install` установит зависимости проекта и загрузит браузеры Playwright.

После этого установите Chef глобально:

```bash
npm install -g @bitrix/chef
```

### chef aliases

Генерирует `aliases.tsconfig.json` — маппинг имён расширений на пути к исходникам. Файл в `.hgignore` — его не нужно коммитить, у каждого разработчика он свой.

## Сборка

Все существующие `bundle.config.js` работают без изменений. Главное отличие — теперь можно собирать по имени расширения:

```bash
# Раньше
bitrix build -p ui/install/js/ui/buttons

# Теперь (из любой директории)
chef build ui.buttons
```

Другие примеры:

```bash
chef build ui.buttons ui.icons       # Несколько расширений
chef build ui.bbcode.*               # Все дочерние ui.bbcode
chef build im.v2.**                  # Все вложенные im.v2
chef build ui.buttons -w             # Watch-режим
chef build ui.buttons --production   # Production (минификация, без source maps)
```

::: tip
В zsh экранируйте `*`: `chef build ui.\*`
:::

### Отличия в собранных бандлах

Chef собирает бандлы немного иначе, чем `@bitrix/cli`. Так как в `modules` бандлы находятся под версионным контролем, после первой сборки через Chef вы увидите diff в собранных файлах. Это нормально — достаточно один раз пересобрать и закоммитить.

Основное отличие — при сборке TypeScript-расширений Chef убирает все комментарии из бандла (JSDoc, однострочные, многострочные). Это уменьшает размер файла. Комментарии остаются в исходниках и в `.d.ts` декларациях.

### Решение конфликтов в бандлах

При мердже могут возникнуть конфликты в файлах `dist/*.bundle.js` и `config.php`. Самый простой способ — пересобрать расширение:

```bash
# 1. Принять любую версию файла (неважно какую)
hg resolve --mark dist/buttons.bundle.js

# 2. Пересобрать — Chef перезапишет бандл и config.php
chef build ui.buttons

# 3. Закоммитить результат
```

Не пытайтесь вручную разрешать конфликты в бандлах — просто пересоберите.

## Линтинг

ESLint обновлён до 9-й версии с flat config. Старые `.eslintrc.*` больше не используются — всё в `eslint.config.js`.

```bash
chef lint ui.buttons           # Линтинг расширения
chef lint ui.bbcode.*          # Группа расширений
chef lint ui.buttons --fix     # С автоисправлением
```

::: tip PhpStorm: линтинг TypeScript файлов
Чтобы ESLint в PhpStorm проверял `.ts` файлы, добавьте расширение в настройках:

**Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint**

В поле **Run for files** добавьте `ts` к списку расширений:

```
{**/*.js,**/*.ts}
```
:::

## Тестирование

Синтаксис тестов (Mocha + Chai) не изменился. Изменилась среда запуска — вместо JSDom теперь реальные браузеры через Playwright.

```bash
chef test main.core                    # Все тесты
chef test unit main.core               # Только unit
chef test e2e ui.buttons               # Только e2e
chef test main.core --headed           # С видимым браузером
chef test main.core --debug            # С DevTools
chef test main.core -w                 # Watch-режим
```

### Структура тестов

Unit-тесты — в `tests/unit/`, e2e-тесты — в `tests/e2e/`:

```
my.extension/
└── tests/
    ├── unit/
    │   └── example.test.ts
    └── e2e/
        └── example.spec.ts
```

Старые тесты в `test/` (без подкаталога) по-прежнему обнаруживаются как unit-тесты.

### `.env.test`

Для запуска тестов создайте `.env.test` в корне репозитория:

```env
BASE_URL=http://localhost
LOGIN=admin
PASSWORD=your_password
```

- **`BASE_URL`** — адрес локальной установки Bitrix. Нужен для unit-тестов (страница с тестами открывается в контексте продукта) и для E2E-тестов.
- **`LOGIN`** / **`PASSWORD`** — учётные данные для E2E-тестов с авторизацией.

Файл уже в `.hgignore` — не коммитьте его.

## Создание расширений

Новые расширения создаются через `chef create`:

```bash
chef create ui.my-feature
```

По умолчанию создаётся TypeScript-расширение:

```
ui/install/js/ui/my-feature/
├── bundle.config.ts
├── config.php
└── src/
    └── ui.my-feature.ts
```

Если нужен JavaScript:

```bash
chef create ui.my-feature --tech js
```

::: warning Не создавайте расширения вручную
`chef create` генерирует правильную структуру файлов, `config.php` с корректными путями и `bundle.config.ts` с namespace. Ручное создание приводит к ошибкам в конфигах и несоответствию конвенциям.
:::

## TypeScript

Теперь расширения можно писать на TypeScript. Базовый `tsconfig.json` уже в репозитории, а алиасы путей генерируются командой `chef aliases` (см. [Генерация алиасов](#генерация-алиасов)). После этого IDE подсказывает типы и автокомплит работает.

Импорт других расширений — по имени:

```ts
import { Loc, Tag, Dom } from 'main.core';
import { Button } from 'ui.buttons';
```

### Перевод существующего расширения на TypeScript

Используйте `chef flow-to-ts` — команда автоматически:

- Переименует `.js` файлы в `.ts` через `hg rename` (с сохранением истории)
- Конвертирует Flow-аннотации в TypeScript (если были)
- Обновит `bundle.config.js` → `bundle.config.ts` с `export default`

```bash
chef flow-to-ts ui.buttons
```

Команда работает и для расширений без Flow — просто переименует файлы и обновит конфиг.

После миграции соберите расширение:

```bash
chef build ui.buttons
```

Chef покажет ошибки TypeScript (если есть) перед сборкой. Типичные случаи:

```ts
// Неявные any — добавить типы
function process(items) { ... }       // ошибка
function process(items: string[]) { } // ок
```

Если у расширения есть тесты — переименуйте и их:

```bash
hg rename tests/unit/buttons.test.js tests/unit/buttons.test.ts
chef test ui.buttons
```

### Декларации типов

При сборке TypeScript-расширений Chef генерирует `.d.ts` рядом с бандлом:

```
dist/
├── buttons.bundle.js      # Бандл
└── buttons.bundle.d.ts    # Декларации типов
```

IDE использует их для подсказок при обращении через неймспейс:

```ts
const button = new BX.UI.Buttons.Button(); // ← типы подхватываются
```

## Диагностика

Новая команда для анализа расширений:

```bash
chef diag top-used                   # Самые востребованные
chef diag top-bundle-size            # Самые тяжёлые бандлы
chef diag circular-deps              # Циклические зависимости
chef diag unused-deps                # Неиспользуемые зависимости
chef diag find-usages main.core      # Где используется расширение
chef diag unused                     # Не используемые зависимости
```

