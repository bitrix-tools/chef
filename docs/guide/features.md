# Возможности

Chef — CLI-инструмент для сборки, тестирования и поддержки фронтенд-расширений Bitrix. Он находит `bundle.config.ts` в структуре проекта и запускает [Rollup](https://rollupjs.org/)-сборку для каждого найденного пакета.

## Сборка

Rollup + Babel + PostCSS под капотом. TypeScript и Vue 3 SFC из коробки. Параллельная сборка до 4 расширений одновременно. Watch-режим с горячей перезагрузкой.

```bash
chef build ui.buttons              # Собрать расширение
chef build ui.* -w                 # Собрать группу + watch
chef build ui.buttons --production # Production-сборка с минификацией
```

Подробнее о конвейере сборки — в разделе [Как работает сборка](#как-работает-сборка).

## TypeScript

Нативная поддержка TypeScript — компиляция `.ts` файлов встроена в конвейер сборки. Создайте расширение командой `chef create` — и сразу получите типизированный конфиг, алиасы путей для всех расширений проекта.

```ts
import { Loc, Tag } from 'main.core';
import { Button } from 'ui.buttons';
```

Подробнее — в разделе [TypeScript](/guide/typescript).

## Vue 3

Пишите компоненты Vue 3 с TypeScript — Chef скомпилирует шаблоны, стили и скрипты. `import 'vue'` автоматически маппится на `ui.vue3`. Single File Components (`.vue`) поддерживаются из коробки.

```ts
import { BitrixVue } from 'ui.vue3';
import Counter from './components/Counter.vue';

BitrixVue.component('ui-counter', Counter);
```

Подробнее — в разделе [Vue 3](/guide/vue).

## Тестирование

Unit-тесты на Mocha + Chai запускаются в реальном браузере через Playwright. E2E-тесты с автоматической авторизацией.

```bash
chef test ui.buttons               # Все тесты
chef test unit ui.buttons           # Только unit
chef test ui.buttons --debug       # С DevTools
```

Подробнее — в разделе [Тестирование](/guide/testing).

## Production-сборка

Минификация через Terser, автоматическая замена переменных окружения (`process.env.NODE_ENV`, `import.meta.env`), отключение source maps. Standalone-режим для сборки без внешних зависимостей.

```bash
chef build ui.buttons --production
```

Подробнее — в разделе [Production-сборка](/guide/production).

## Аналитика

Размеры бандлов, дерево зависимостей и дубликаты — `chef stat` покажет всё по одному расширению или сразу по группе.

```bash
chef stat ui.buttons
chef stat ui.*
```

## Scaffold

`chef create` создаст расширение с правильной структурой, конфигом, точкой входа и шаблонами тестов.

```bash
chef create ui.buttons
```

## JS-расширения

Рекомендуемый способ организации фронтенд-кода в Bitrix — JS-расширения. Это самостоятельные модули с точкой входа, конфигурацией сборки и PHP-манифестом.

JS-расширение подключается на страницу через `\Bitrix\Main\UI\Extension::load('vendor.name')`, поддерживает систему зависимостей и может импортироваться в коде других расширений.

```
local/js/ui/buttons/
├── bundle.config.ts       # Конфигурация сборки
├── config.php             # PHP-манифест (зависимости, ресурсы)
├── src/
│   └── buttons.ts         # Точка входа
├── dist/
│   ├── buttons.bundle.js  # Скомпилированный JS
│   └── buttons.bundle.css # Скомпилированные стили
└── test/
    ├── unit/              # Unit-тесты (Mocha + Chai)
    │   └── buttons.test.ts
    └── e2e/               # E2E-тесты (Playwright)
        └── buttons.spec.ts
```

Имя расширения формируется из пути: `local/js/ui/buttons/` → `ui.buttons`.

Подробнее — в разделе [JS-расширение](/guide/extension).

### Другие сущности

Помимо JS-расширений, Chef может собирать фронтенд-код в других сущностях Bitrix: компонентах, шаблонах и активити. Однако этот подход считается устаревшим — такие сущности не поддерживают систему зависимостей.

::: warning Сборка устаревших сущностей
Компоненты, шаблоны и активити не поддерживают систему зависимостей — их нельзя импортировать в коде или указывать как зависимости в `config.php`. Весь фронтенд-код следует выносить в JS-расширения, а в остальных сущностях оставлять только инициализацию:

```php
\Bitrix\Main\UI\Extension::load('vendor.news-list');
```
:::

## Структура проекта

Стандартная установка Bitrix с директориями `bitrix/` и `local/`. Конфиги в корне проекта создаются командами `chef init`:

```
project/
├── .browserslistrc                    # Целевые браузеры (chef init build)
├── tsconfig.json                      # Конфиг TypeScript (chef init build)
├── aliases.tsconfig.json              # Алиасы путей расширений (chef init build)
├── playwright.config.ts               # Конфиг Playwright (chef init tests)
├── .env.test                          # Учётные данные для тестов (chef init tests)
│
├── bitrix/                            # Системная директория (только чтение)
│   └── js/
│       └── main/
│           └── core/                  # Системное расширение: main.core
│
└── local/                             # Пользовательская директория (сборка здесь)
    ├── js/
    │   └── vendor/
    │       └── my-extension/          # JS-расширение: vendor.my-extension
    └── modules/
        └── vendor.module/
            └── install/
                └── js/
                    └── vendor/
                        └── feature/   # Расширение в модуле
```

::: danger Директория bitrix/ — только для чтения
`bitrix/` содержит ядро платформы и перезаписывается при обновлении. Chef использует `bitrix/js/` только для чтения — чтобы разрешить зависимости и определить неймспейсы расширений ядра. Сборка работает только в `local/`.
:::

::: tip Переопределение системных расширений
Если нужно изменить системное расширение — скопируйте его в `local/js/` и модифицируйте там. При подключении расширения на страницу Bitrix сначала ищет его в `local/js/`, затем в `bitrix/js/`, поэтому локальная копия автоматически заменит системную.
:::

## Как работает сборка

### Указание пакетов

Большинство команд Chef (`build`, `test`, `stat`) принимают список расширений одинаковым способом.

**Одно или несколько расширений по имени:**

```bash
chef build ui.buttons
chef build ui.buttons main.core ui.icons
```

**Glob-паттерн** — для работы сразу с группой расширений:

```bash
chef build ui.*                    # Все расширения с префиксом ui.
chef build ui.bbcode.*             # Все расширения внутри ui.bbcode
```

::: tip
В zsh glob-паттерны нужно экранировать, чтобы оболочка не раскрывала их сама:
```bash
chef build ui.\*
```
:::

**Сканирование директории** — без аргументов Chef сканирует текущую директорию:

```bash
cd local/js/ui
chef build                         # Все расширения внутри ui/
chef build -p local/js/ui          # Или явно указать директорию
```

### Конвейер сборки

При запуске `chef build` для каждого пакета выполняется:

1. **Чтение конфигурации** — парсинг `bundle.config.ts`
2. **Сборка бандла** через Rollup:
   - [TypeScript](https://www.typescriptlang.org/) — компиляция `.ts` файлов
   - [Babel](https://babeljs.io/) — транспиляция в целевые браузеры
   - [PostCSS](https://postcss.org/) — автопрефиксы, SVG-оптимизация, инлайн-картинки
   - [Terser](https://terser.org/) — минификация (если включена)
3. **Обновление `config.php`** — анализ импортов и запись зависимостей в `rel`
4. **Source maps** — генерация карт исходников (если включена)

Собирается до 4 пакетов параллельно.

### Неймспейсы

Каждое расширение объявляет глобальный неймспейс в `bundle.config.ts`:

```ts
export default {
  input: './src/buttons.ts',
  output: './dist/buttons.bundle.js',
  namespace: 'BX.UI.Buttons',
};
```

При сборке всё, что экспортируется из точки входа, становится доступно через этот неймспейс:

```ts
// src/buttons.ts
export class Button { /* ... */ }
export class ButtonGroup { /* ... */ }
```

После сборки в браузере:

```ts
const button = new BX.UI.Buttons.Button();
const group = new BX.UI.Buttons.ButtonGroup();
```

Если `namespace` не указан, по умолчанию используется `window` — экспорты становятся глобальными переменными.

### Зависимости

В исходном коде используются стандартные ES-импорты:

```ts
import { Loc, Tag } from 'main.core';
import { Button } from 'ui.buttons';
```

Chef при сборке анализирует импорты, подменяет их на обращения к глобальным неймспейсам и обновляет `config.php`:

```php
return [
    'js'  => ['./dist/my.extension.bundle.js'],
    'css' => ['./dist/my.extension.bundle.css'],
    'rel' => [
        'main.core',
        'ui.buttons',
    ],
];
```

Если расширение не зависит от `main.core`, Chef автоматически добавляет `'skip_core' => true`, чтобы не загружать ядро без необходимости.

### Защищённые расширения

Расширение можно пометить как защищённое в `bundle.config.ts`:

```ts
export default {
  input: './src/index.ts',
  output: './dist/index.bundle.js',
  protected: true,
};
```

Защищённые расширения пропускаются при сканировании (`chef build` без аргументов или с glob-паттерном), но собираются при явном указании имени.
