# Обзор

Chef — CLI-инструмент для сборки, тестирования и поддержки фронтенд-расширений Bitrix. Он находит `bundle.config.js` или `bundle.config.ts` в структуре проекта и запускает [Rollup](https://rollupjs.org/)-сборку для каждого найденного пакета.

## JS-расширения

Рекомендуемый способ организации фронтенд-кода в Bitrix — JS-расширения. Это самостоятельные модули с точкой входа, конфигурацией сборки и PHP-манифестом. Именно с ними в первую очередь предназначен работать Chef.

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

Только JS-расширения поддерживают систему зависимостей — их можно импортировать в коде других расширений и указывать как зависимости в `config.php`.

Новое расширение можно создать командой:

```bash
chef create ui.buttons              # TypeScript (по умолчанию)
chef create ui.buttons --tech js    # JavaScript
```

## Другие сущности

Помимо JS-расширений, Chef может собирать фронтенд-код в других сущностях Bitrix: компонентах, шаблонах и активити. Однако этот подход считается устаревшим — такие сущности не поддерживают систему зависимостей, и в ближайших версиях их сборка начнёт вызывать предупреждение в консоли.

### Компоненты <Badge type="warning" text="deprecated" />

Визуальные блоки страницы с серверной и клиентской логикой.

```
local/components/vendor/news.list/
├── bundle.config.ts
├── class.php
├── src/
│   └── index.ts
└── dist/
    └── index.bundle.js
```

### Шаблоны компонентов <Badge type="warning" text="deprecated" />

Отвечают за отображение данных компонента. Вложены внутрь директории компонента.

```
local/components/vendor/news.list/templates/custom/
├── bundle.config.ts
├── template.php
├── src/
│   └── index.ts
└── dist/
    └── index.bundle.js
```

### Шаблоны сайтов <Badge type="warning" text="deprecated" />

Определяют общий дизайн и разметку страниц.

```
local/templates/my_template/
├── bundle.config.ts
├── header.php
├── footer.php
├── src/
│   └── index.ts
└── dist/
    └── index.bundle.js
```

### Компоненты в шаблонах сайтов <Badge type="warning" text="deprecated" />

Переопределённые шаблоны компонентов внутри шаблона сайта.

```
local/templates/my_template/components/bitrix/news.list/custom/
├── bundle.config.ts
├── template.php
├── src/
│   └── index.ts
└── dist/
    └── index.bundle.js
```

### Активити (бизнес-процессы) <Badge type="warning" text="deprecated" />

Действия для дизайнера бизнес-процессов. Могут содержать фронтенд для настройки параметров.

```
local/activities/custom/my_activity/
├── bundle.config.ts
├── src/
│   └── index.ts
└── dist/
    └── index.bundle.js
```

::: warning Сборка устаревших сущностей
В ближайших обновлениях сборка компонентов, шаблонов и активити начнёт вызывать предупреждение в консоли.

Компоненты, шаблоны и активити не поддерживают систему зависимостей — их нельзя импортировать в коде или указывать как зависимости в `config.php`. Поэтому весь фронтенд-код следует выносить в JS-расширения, а в остальных сущностях оставлять только инициализацию:

```php
// template.php компонента — только инициализация расширения
\Bitrix\Main\UI\Extension::load('vendor.news-list');
```

```html
<script>
    BX.ready(() => {
        BX.Vendor.NewsList.init(<?= Json::encode($arResult) ?>);
    });
</script>
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
├── bitrix/                            # ⛔ Системная директория (только чтение)
│   └── js/
│       └── main/
│           └── core/                  # Системное расширение: main.core
│
└── local/                             # ✅ Пользовательская директория (сборка здесь)
    ├── js/
    │   └── vendor/
    │       └── my-extension/          # JS-расширение: vendor.my-extension
    ├── components/
    │   └── vendor/
    │       └── news.list/             # Компонент
    │           └── templates/
    │               └── custom/        # Шаблон компонента
    ├── templates/
    │   └── my_template/               # Шаблон сайта
    │       └── components/
    │           └── bitrix/
    │               └── menu/
    │                   └── horizontal/ # Компонент в шаблоне сайта
    ├── activities/
    │   └── custom/
    │       └── my_activity/           # Активити
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
Если нужно изменить системное расширение — скопируйте его в `local/js/` и модифицируйте там. При подключении расширения на страницу Bitrix сначала ищет его в `local/js/`, затем в `bitrix/js/`, поэтому локальная копия автоматически заменит системную. Chef работает так же: при разрешении зависимости `local/js/` проверяется первой.
:::

### Инициализация конфигов

```bash
chef init build    # Создаёт tsconfig.json, aliases.tsconfig.json, .browserslistrc
chef init tests    # Создаёт playwright.config.ts, .env.test
```

`chef init build` сканирует все расширения и генерирует `aliases.tsconfig.json` с путями, чтобы в коде работали импорты вида `import { Tag } from 'main.core'`. Подробнее — в разделе [Настройка TypeScript](/guide/typescript).

`chef init tests` создаёт конфиг Playwright и файл с учётными данными для автоматической аутентификации при тестировании. Подробнее — в разделе [Настройка тестов](/guide/test-setup).

## Как работает сборка

### Указание пакетов

Большинство команд Chef (`build`, `test`, `stat`) принимают список расширений одинаковым способом.

**Одно или несколько расширений по имени:**

```bash
chef build ui.buttons
chef build ui.buttons main.core ui.icons    # Несколько через пробел
```

**Glob-паттерн** — для работы сразу с группой расширений:

```bash
chef build ui.*                    # Все расширения с префиксом ui.
chef build ui.bbcode.*             # Все расширения внутри ui.bbcode
chef build main.core ui.* crm.*   # Можно комбинировать имена и паттерны
```

::: tip
В zsh glob-паттерны нужно экранировать, чтобы оболочка не раскрывала их сама:
```bash
chef build ui.\*
```
:::

**Сканирование директории** — без аргументов Chef сканирует текущую директорию и собирает все найденные расширения:

```bash
cd local/js/ui
chef build               # Все расширения внутри ui/

chef build -p local/js/ui    # Или явно указать директорию через --path
```

Те же правила работают для `chef test` и `chef stat`:

```bash
chef test ui.*               # Запустить тесты для всех ui.* расширений
chef stat ui.* main.core     # Статистика по группе расширений
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

```js
const button = new BX.UI.Buttons.Button();
const group = new BX.UI.Buttons.ButtonGroup();
```

Если `namespace` не указан, по умолчанию используется `window` — экспорты становятся глобальными переменными.

#### Устройство бандла

Собранный бандл — это IIFE, которая расширяет объект неймспейса. Вот упрощённый пример для расширения `ui.buttons` с зависимостью от `main.core`:

```js
/* eslint-disable */
this.BX = this.BX || {};
this.BX.UI = this.BX.UI || {};
(function (exports, main_core) {
    'use strict';

    class Button {
        constructor(options) {
            this.node = main_core.Tag.render`<button>${options.text}</button>`;
        }
        render() {
            return this.node;
        }
    }

    exports.Button = Button;

}((this.BX.UI.Buttons = this.BX.UI.Buttons || {}), BX));
```

- `this.BX.UI.Buttons` — объект неймспейса, все экспорты попадают в него
- `BX` — глобальный неймспейс зависимости `main.core`, передаётся как аргумент IIFE
- `import { Tag } from 'main.core'` в исходнике превращается в обращение к `main_core.Tag`

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